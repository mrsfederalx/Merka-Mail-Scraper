"""Business table API — denormalized leads view."""

import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import (
    DomainRepository, EmailRepository, SocialLinkRepository,
    ContactRepository, BusinessRepository,
)
from backend.middleware.auth import get_current_user, get_client_id

router = APIRouter(prefix="/api/business", tags=["business"])

SOCIAL_PLATFORMS = ["facebook", "linkedin", "twitter", "instagram", "youtube"]


def _flatten(domain_row: dict) -> dict:
    emails = domain_row.get("emails", [])
    socials = domain_row.get("social_links", [])
    contacts = domain_row.get("contacts", [])

    record: dict = {
        "domain_id": domain_row["id"],
        "domain": domain_row["domain"],
        "status": domain_row.get("status"),
        "platform": domain_row.get("platform"),
        "method": domain_row.get("method"),
        "processing_time_ms": domain_row.get("processing_time_ms"),
        "processed_at": domain_row.get("processed_at"),
        "email_count": len(emails),
    }

    for i in range(10):
        record[f"email_{i+1}"] = emails[i]["email"] if i < len(emails) else None

    social_map = {}
    other = []
    for sl in socials:
        p = (sl.get("platform") or "").lower()
        if p in SOCIAL_PLATFORMS:
            social_map[p] = sl["url"]
        else:
            other.append(sl["url"])
    for p in SOCIAL_PLATFORMS:
        record[p] = social_map.get(p)
    record["other_social"] = ", ".join(other) if other else None

    dms = contacts[:3]
    for j in range(3):
        n = j + 1
        if j < len(dms):
            dm = dms[j]
            record[f"dm{n}_name"] = dm.get("full_name")
            record[f"dm{n}_role"] = dm.get("role")
            record[f"dm{n}_email"] = dm.get("email_found")
            record[f"dm{n}_linkedin"] = dm.get("linkedin_url")
            record[f"dm{n}_score"] = dm.get("score")
        else:
            for k in ("name", "role", "email", "linkedin", "score"):
                record[f"dm{n}_{k}"] = None

    return record


async def _sync_client(conn, client_id: int) -> int:
    domain_repo = DomainRepository(conn)
    email_repo = EmailRepository(conn)
    social_repo = SocialLinkRepository(conn)
    contact_repo = ContactRepository(conn)
    biz_repo = BusinessRepository(conn)

    rows, _ = await domain_repo.get_filtered(client_id=client_id, limit=100000)
    count = 0
    for row in rows:
        row["emails"] = await email_repo.get_by_domain_id(row["id"])
        row["social_links"] = await social_repo.get_by_domain_id(row["id"])
        row["contacts"] = await contact_repo.get_decision_makers_by_domain(row["id"])
        record = _flatten(row)
        await biz_repo.upsert(client_id, record)
        count += 1
    return count


@router.post("/sync")
async def sync_business(current_user: dict = Depends(get_current_user)):
    """Tüm domain verilerini business tablosuna senkronize et."""
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await _sync_client(conn, client_id)
    return {"success": True, "synced": count}


@router.get("")
async def list_business(
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows, total = await BusinessRepository(conn).get_filtered(
            client_id=client_id, search=search, status=status, page=page, limit=limit
        )
    return {
        "success": True, "data": rows, "total": total,
        "page": page, "total_pages": (total + limit - 1) // limit,
    }


@router.get("/export/{fmt}")
async def export_business(fmt: str, current_user: dict = Depends(get_current_user)):
    """Business tablosunu CSV veya XLSX olarak indir."""
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await BusinessRepository(conn).get_all(client_id)

    # Gereksiz iç kolonları çıkar
    SKIP = {"id", "client_id", "domain_id", "synced_at"}
    clean = [{k: v for k, v in r.items() if k not in SKIP} for r in rows]

    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if fmt == "csv":
        import csv
        if not clean:
            clean = [{}]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=clean[0].keys())
        writer.writeheader()
        writer.writerows(clean)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="business_{ts}.csv"'},
        )

    elif fmt == "excel":
        import pandas as pd
        df = pd.DataFrame(clean) if clean else pd.DataFrame()
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Business")
            ws = writer.sheets["Business"]
            for col_idx, col in enumerate(df.columns, 1):
                max_len = max(len(str(col)), df[col].astype(str).map(len).max() if len(df) > 0 else 0)
                ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 3, 60)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="business_{ts}.xlsx"'},
        )

    return {"success": False, "error": "fmt must be csv or excel"}
