import pytest
from test_workflow import campus as campus
from test_workflow import detail, draft, generate, publish

from app.db import models as m


def move(client, version, lesson, day, slot):
    response = client.put(
        f"/api/admin/schedule/versions/{version['id']}/assignments/{lesson['occurrence_id']}",
        json={
            "revision": version["revision"],
            "day": day,
            "slot": slot,
            "room_id": lesson["room_id"],
        },
    )
    assert response.status_code == 200, response.text
    return {**version, "revision": response.json()["revision"]}


def test_stale_draft_cannot_undo_later_publication(admin_client, campus):
    client = admin_client
    september_7, september_14 = "2026-09-07", "2026-09-14"
    v1_draft = draft(client, campus)
    assert generate(client, v1_draft, campus)["status"] == "complete"
    generated = detail(client, v1_draft)
    lesson, *other_lessons = generated["assignments"]
    occupied = {
        other["slot"]
        for other in other_lessons
        if other["day"] in (september_7, september_14)
    }
    slot = next(slot for slot in range(1, 5) if slot not in occupied)
    v1 = publish(client, move(client, generated["version"], lesson, september_14, slot))

    draft_a = draft(client, campus)
    draft_b = draft(client, campus)
    occurrence_id = lesson["occurrence_id"]

    def published_lesson():
        return next(
            item
            for item in client.get("/api/schedule").json()
            if item["occurrence_id"] == occurrence_id
        )

    assert published_lesson()["version_id"] == v1["id"]
    assert published_lesson()["day"] == september_14
    assert all(
        next(item for item in detail(client, candidate)["assignments"]
             if item["occurrence_id"] == occurrence_id)["day"] == september_14
        for candidate in (draft_a, draft_b)
    )

    v2 = publish(client, move(client, draft_b, lesson, september_7, slot))
    assert published_lesson()["version_id"] == v2["id"]
    assert published_lesson()["day"] == september_7
    response = client.post(
        f"/api/admin/schedule/versions/{draft_a['id']}/publish",
        json={"revision": draft_a["revision"]},
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == {
        "code": "draft_based_on_outdated_publication",
        "cohort_ids": [campus["group"].id],
    }
    assert published_lesson()["version_id"] == v2["id"]
    assert published_lesson()["day"] == september_7
    retained = detail(client, draft_a)
    assert retained["version"]["status"] == "draft"
    assert retained["version"]["revision"] == draft_a["revision"]
    assert next(
        item for item in retained["assignments"] if item["occurrence_id"] == occurrence_id
    )["day"] == september_14


@pytest.mark.parametrize("known_base", [None, {}])
def test_unknown_base_cannot_be_published_even_with_no_prior_publication(
    admin_client, campus, known_base
):
    version = draft(admin_client, campus)
    group_id = campus["group"].id
    assert version["base_versions"] == {str(group_id): None}
    db = campus["db"]
    db.get(m.ScheduleVersion, version["id"]).base_versions = known_base
    db.commit()

    response = admin_client.post(
        f"/api/admin/schedule/versions/{version['id']}/publish",
        json={"revision": version["revision"]},
    )

    assert response.status_code == 409, response.text
    assert response.json()["detail"] == {
        "code": "draft_based_on_outdated_publication",
        "cohort_ids": [group_id],
    }
    assert db.get(m.PublishedGroup, (campus["term"].id, group_id)) is None


def test_publication_reports_only_changed_cohorts(admin_client, campus):
    client = admin_client
    db = campus["db"]
    term_id = campus["term"].id
    group_id = campus["group"].id
    other = m.CourseGroup(
        major_id=campus["major"].id,
        group_code="T2",
        admission_year=campus["group"].admission_year,
        capacity=20,
    )
    db.add(other)
    db.flush()
    db.add(m.Workload(
        term_id=term_id,
        course_group_id=other.id,
        subject_id=campus["subject"].id,
        teacher_id=campus["teacher"].id,
        lesson_type="lecture",
        semester_hours=2,
    ))
    db.commit()
    combined = client.post(
        "/api/admin/schedule/versions",
        json={"name": "Both groups", "term_id": term_id, "cohort_ids": [group_id, other.id]},
    )
    assert combined.status_code == 201, combined.text
    version = combined.json()
    assert version["base_versions"] == {str(group_id): None, str(other.id): None}

    current = draft(client, campus)
    assert generate(client, current, campus)["status"] == "complete"
    publish(client, detail(client, current)["version"])

    response = client.post(
        f"/api/admin/schedule/versions/{version['id']}/publish",
        json={"revision": version["revision"]},
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == {
        "code": "draft_based_on_outdated_publication",
        "cohort_ids": [group_id],
    }
    assert db.get(m.PublishedGroup, (term_id, other.id)) is None
