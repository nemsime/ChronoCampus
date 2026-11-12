"""Regression tests for catalog edits that used to bypass schedule invariants."""

from copy import deepcopy

import pytest
from sqlalchemy import select
from test_scheduling import sample_snapshot
from test_workflow import campus as campus
from test_workflow import detail, draft, generate

from app.db import models as m
from app.scheduling.validation import validate


def catalog_body(client, resource, identifier):
    row = next(row for row in client.get(f"/api/admin/catalog/{resource}").json()
               if row["id"] == identifier)
    row.pop("id")
    return row


def test_validator_never_completes_with_an_unplaced_emergency():
    snapshot = sample_snapshot()
    snapshot["workloads"] = snapshot["workloads"][:1]
    snapshot["occurrences"] = snapshot["occurrences"][:2]
    snapshot["calendar"]["academic_hours_per_lesson"] = 4
    snapshot["disruptions"] = [{"occurrence_id": 2, "original_day": "2026-09-14",
                                "original_slot": 1}]
    assignments = [{"occurrence_id": 1, "day": "2026-09-07", "slot": 1,
                    "starts_at": "09:30", "ends_at": "10:50", "room_id": 1}]
    report = validate(snapshot, assignments)
    assert report["hours"][0]["remaining_hours"] == 0
    assert report["unplaced_occurrences"] == [2]
    assert report["complete"] is False


def test_validator_rejects_incompatible_study_form():
    snapshot = sample_snapshot()
    snapshot["calendar"]["study_form"] = "remote"
    snapshot["groups"][0]["study_form"] = "present"
    report = validate(snapshot, [])
    assert {issue["code"] for issue in report["issues"]} == {"study_form_mismatch"}


def test_publication_rechecks_teaching_week_count(admin_client, campus):
    version = draft(admin_client, campus)
    assert generate(admin_client, version, campus)["status"] == "complete"
    complete = detail(admin_client, version)
    body = catalog_body(admin_client, "calendars", campus["calendar"].id)
    body["teaching_weeks"] = 16
    response = admin_client.put(f"/api/admin/catalog/calendars/{campus['calendar'].id}", json=body)
    assert response.status_code == 200, response.text
    response = admin_client.post(f"/api/admin/schedule/versions/{version['id']}/publish",
                                 json={"revision": complete["version"]["revision"]})
    assert response.status_code == 409, response.text
    report = response.json()["detail"]["report"]
    assert any(issue["code"] == "teaching_week_count_mismatch" for issue in report["issues"])


@pytest.mark.parametrize("units", [None, 1, 4])
def test_calendar_units_cannot_change_materialized_workload(admin_client, campus, units):
    draft(admin_client, campus)
    body = catalog_body(admin_client, "calendars", campus["calendar"].id)
    body.update(academic_hours_per_lesson=units, confirmed=units is not None)
    response = admin_client.put(f"/api/admin/catalog/calendars/{campus['calendar'].id}", json=body)
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "academic_units_have_occurrences"
    saved = catalog_body(admin_client, "calendars", campus["calendar"].id)
    assert saved["academic_hours_per_lesson"] == 2


def test_term_calendar_reassignment_preserves_materialized_units(admin_client, campus):
    draft(admin_client, campus)
    calendar = catalog_body(admin_client, "calendars", campus["calendar"].id)
    calendar.update(name="Alternative", academic_hours_per_lesson=4)
    alternative = admin_client.post("/api/admin/catalog/calendars", json=calendar)
    assert alternative.status_code == 201, alternative.text
    body = catalog_body(admin_client, "terms", campus["term"].id)
    body["calendar_id"] = alternative.json()["id"]
    response = admin_client.put(f"/api/admin/catalog/terms/{campus['term'].id}", json=body)
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "academic_units_have_occurrences"
    calendar["academic_hours_per_lesson"] = 2
    response = admin_client.put(f"/api/admin/catalog/calendars/{alternative.json()['id']}", json=calendar)
    assert response.status_code == 200, response.text
    response = admin_client.put(f"/api/admin/catalog/terms/{campus['term'].id}", json=body)
    assert response.status_code == 200, response.text


def test_calendar_and_term_edits_cannot_cross_study_forms(admin_client, campus):
    calendar = catalog_body(admin_client, "calendars", campus["calendar"].id)
    part_time = deepcopy(calendar)
    part_time.update(name="Part-time", study_form="remote")
    response = admin_client.put(f"/api/admin/catalog/calendars/{campus['calendar'].id}", json=part_time)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "study_form_mismatch"
    alternative = admin_client.post("/api/admin/catalog/calendars", json=part_time)
    assert alternative.status_code == 201, alternative.text
    term = catalog_body(admin_client, "terms", campus["term"].id)
    term["calendar_id"] = alternative.json()["id"]
    response = admin_client.put(f"/api/admin/catalog/terms/{campus['term'].id}", json=term)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "study_form_mismatch"


def test_units_must_divide_existing_unmaterialized_workloads(admin_client, campus):
    body = catalog_body(admin_client, "calendars", campus["calendar"].id)
    body["academic_hours_per_lesson"] = 3
    response = admin_client.put(f"/api/admin/catalog/calendars/{campus['calendar'].id}", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "indivisible_workload"


def test_equipment_referenced_only_by_workload_cannot_be_deleted(admin_client, campus):
    equipment = admin_client.post("/api/admin/catalog/equipment", json={"name": "Required projector"})
    assert equipment.status_code == 201, equipment.text
    identifier = equipment.json()["id"]
    workload = campus["db"].scalar(select(m.Workload).limit(1))
    body = catalog_body(admin_client, "workloads", workload.id)
    body["equipment_ids"] = [identifier]
    assert admin_client.put(f"/api/admin/catalog/workloads/{workload.id}", json=body).status_code == 200
    draft(admin_client, campus)
    response = admin_client.delete(f"/api/admin/catalog/equipment/{identifier}")
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "equipment_has_workload"
    assert any(row["id"] == identifier for row in
               admin_client.get("/api/admin/catalog/equipment").json())
