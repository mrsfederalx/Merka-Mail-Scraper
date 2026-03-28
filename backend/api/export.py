"""Export API endpoints."""

import io
import json
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, EmailRepository, SocialLinkRepository, ContactRepository
from backend.middleware.auth import get_current_user, get_client_id

router = APIRouter(prefix="/api/export", tags=["export"])


async def _enrich_rows(conn, client_id: int, limit=100000):
    domain_repo = DomainRepository(conn)
    email_repo = EmailRepository(conn)
    social_repo = SocialLinkRepository(conn)
    contact_repo = ContactRepository(conn)
    rows, _ = await domain_repo.get_filtered(client_id=client_id, limit=limit)
    for row in rows:
        row["emails"] = await email_repo.get_by_domain_id(row["id"])
        row["social_links"] = await social_repo.get_by_domain_id(row["id"])
        row["contacts"] = await contact_repo.get_decision_makers_by_domain(row["id"])
    return rows


def _build_flat_rows(rows):
    max_emails = max((len(r.get("emails", [])) for r in rows), default=0)
    social_platforms = ["facebook", "linkedin", "twitter", "instagram", "youtube"]
    flat = []
    for row in rows:
        emails = row.get("emails", [])
        social_links = row.get("social_links", [])
        entry = {"Domain": row["domain"], "Status": row["status"], "Platform": row.get("platform", ""), "Method": row.get("method", "")}
        for i in range(max_emails):
            entry[f"Email {i+1}"] = emails[i]["email"] if i < len(emails) else ""
        entry["Email Count"] = len(emails)
        social_map = {}
        other_socials = []
        for sl in social_links:
            p = (sl.get("platform") or "").lower()
            if p in social_platforms:
                social_map[p] = sl["url"]
            else:
                other_socials.append(sl["url"])
        for p in social_platforms:
            entry[p.capitalize()] = social_map.get(p, "")
        entry["Other Social"] = ", ".join(other_socials) if other_socials else ""
        dm_contacts = row.get("contacts", [])[:3]
        for j in range(3):
            prefix = f"DM{j+1}"
            if j < len(dm_contacts):
                dm = dm_contacts[j]
                entry[f"{prefix} Name"] = dm.get("full_name", "")
                entry[f"{prefix} Role"] = dm.get("role", "")
                entry[f"{prefix} Email"] = dm.get("email_found", "")
                entry[f"{prefix} LinkedIn"] = dm.get("linkedin_url", "")
                entry[f"{prefix} Score"] = dm.get("score", 0)
            else:
                for k in ["Name", "Role", "Email", "LinkedIn", "Score"]:
                    entry[f"{prefix} {k}"] = ""
        entry["Processing Time (ms)"] = row.get("processing_time_ms", "")
        entry["Processed At"] = row.get("processed_at", "")
        flat.append(entry)
    return flat


@router.get("/{format}")
async def export_data(format: str, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await _enrich_rows(conn, client_id)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "json":
        content = json.dumps(rows, indent=2, ensure_ascii=False, default=str)
        return StreamingResponse(io.BytesIO(content.encode("utf-8")), media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="export_{timestamp}.json"'})

    elif format == "csv":
        import csv
        flat_rows = _build_flat_rows(rows)
        if not flat_rows:
            flat_rows = [{"Domain": ""}]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=flat_rows[0].keys())
        writer.writeheader()
        writer.writerows(flat_rows)
        return StreamingResponse(io.BytesIO(output.getvalue().encode("utf-8-sig")), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="export_{timestamp}.csv"'})

    elif format == "excel":
        import pandas as pd
        flat_rows = _build_flat_rows(rows)
        df = pd.DataFrame(flat_rows) if flat_rows else pd.DataFrame()
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Leads")
            ws = writer.sheets["Leads"]
            for col_idx, col in enumerate(df.columns, 1):
                max_len = max(len(str(col)), df[col].astype(str).map(len).max() if len(df) > 0 else 0)
                ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 3, 50)
        output.seek(0)
        return StreamingResponse(output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="export_{timestamp}.xlsx"'})
    else:
        return {"success": False, "error": "Invalid format. Use: csv, excel, json"}
