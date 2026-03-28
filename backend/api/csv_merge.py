"""CSV Merge API."""

import io
import csv
import re
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse, JSONResponse

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, EmailRepository, SocialLinkRepository, ContactRepository
from backend.middleware.auth import get_current_user, get_client_id

router = APIRouter(prefix="/api/csv-merge", tags=["csv-merge"])


def _normalize_domain(raw: str) -> str:
    if not raw:
        return ""
    d = raw.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^www\.", "", d)
    d = d.split("/")[0]
    return d


async def _get_db_data_by_domain(conn, client_id: int) -> dict:
    domain_repo = DomainRepository(conn)
    email_repo = EmailRepository(conn)
    social_repo = SocialLinkRepository(conn)
    contact_repo = ContactRepository(conn)
    rows, _ = await domain_repo.get_filtered(client_id=client_id, limit=100000)
    lookup = {}
    for row in rows:
        domain_id = row["id"]
        lookup[row["domain"]] = {
            "status": row.get("status", ""),
            "emails": await email_repo.get_by_domain_id(domain_id),
            "contacts": await contact_repo.get_decision_makers_by_domain(domain_id),
            "social_links": await social_repo.get_by_domain_id(domain_id),
        }
    return lookup


@router.post("/preview")
async def preview_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        columns = reader.fieldnames or []
        rows = [row for i, row in enumerate(reader) if i < 10]
        total_rows = len(text.strip().split("\n")) - 1
        domain_column = next((col for col in columns if col.lower() in ("website", "domain", "site", "url", "web")), None)
        return {"success": True, "data": {"columns": columns, "preview_rows": rows, "total_rows": total_rows, "domain_column": domain_column}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/merge")
async def merge_csv(
    file: UploadFile = File(...),
    domain_column: str = Form(default="website"),
    current_user: dict = Depends(get_current_user),
):
    import pandas as pd
    client_id = get_client_id(current_user)
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        csv_rows = list(reader)
        if not csv_rows:
            return JSONResponse(status_code=400, content={"success": False, "error": "CSV dosyasi bos"})

        pool = await get_pool()
        async with pool.acquire() as conn:
            db_lookup = await _get_db_data_by_domain(conn, client_id)

        social_platforms = ["facebook", "linkedin", "twitter", "instagram", "youtube"]
        max_emails = max((len(db_lookup.get(_normalize_domain(r.get(domain_column, "")), {}).get("emails", [])) for r in csv_rows), default=2)
        max_emails = max(max_emails, 2)
        max_dms = 3
        csv_columns = [c for c in (reader.fieldnames or []) if c != "raw_data"]
        merged = []
        match_count = 0

        for row in csv_rows:
            domain = _normalize_domain(row.get(domain_column, ""))
            entry = {col: row.get(col, "") for col in csv_columns}
            db_data = db_lookup.get(domain)
            if db_data:
                match_count += 1
                emails = db_data.get("emails", [])
                contacts = db_data.get("contacts", [])[:max_dms]
                social_links = db_data.get("social_links", [])
                entry["DB Status"] = db_data.get("status", "")
                for i in range(max_emails):
                    entry[f"Email {i+1}"] = emails[i]["email"] if i < len(emails) else ""
                entry["Email Count"] = len(emails)
                social_map = {(sl.get("platform") or "").lower(): sl["url"] for sl in social_links if (sl.get("platform") or "").lower() in social_platforms}
                for p in social_platforms:
                    entry[p.capitalize()] = social_map.get(p, "")
                for j in range(max_dms):
                    prefix = f"DM{j+1}"
                    if j < len(contacts):
                        dm = contacts[j]
                        entry.update({f"{prefix} Name": dm.get("full_name", ""), f"{prefix} Role": dm.get("role", ""), f"{prefix} Email": dm.get("email_found", "") or "", f"{prefix} LinkedIn": dm.get("linkedin_url", ""), f"{prefix} Score": dm.get("score", 0)})
                    else:
                        for k in ["Name", "Role", "Email", "LinkedIn", "Score"]:
                            entry[f"{prefix} {k}"] = ""
            else:
                entry.update({"DB Status": "", "Email Count": 0})
                for i in range(max_emails):
                    entry[f"Email {i+1}"] = ""
                for p in social_platforms:
                    entry[p.capitalize()] = ""
                for j in range(max_dms):
                    prefix = f"DM{j+1}"
                    for k in ["Name", "Role", "Email", "LinkedIn", "Score"]:
                        entry[f"{prefix} {k}"] = ""
            merged.append(entry)

        df = pd.DataFrame(merged)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Merged Data")
            ws = writer.sheets["Merged Data"]
            for col_idx, col in enumerate(df.columns, 1):
                max_len = max(len(str(col)), df[col].astype(str).map(len).max() if len(df) > 0 else 0)
                ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 3, 50)
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="merged_{timestamp}.xlsx"', "X-Match-Count": str(match_count), "X-Total-Rows": str(len(merged)), "Access-Control-Expose-Headers": "X-Match-Count, X-Total-Rows"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
