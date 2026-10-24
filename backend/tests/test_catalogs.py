def test_catalog_requires_authentication(client):
    assert client.get("/api/admin/catalog/faculties").status_code == 401


def test_catalog_persistence_validation_and_references(admin_client):
    faculty = admin_client.post(
        "/api/admin/catalog/faculties", json={"name": "Engineering", "code": "ENG"}
    )
    assert faculty.status_code == 201, faculty.text
    assert (
        admin_client.get("/api/admin/catalog/faculties").json()[0]["name"]
        == "Engineering"
    )
    duplicate = admin_client.post(
        "/api/admin/catalog/faculties", json={"name": "Other", "code": "ENG"}
    )
    assert duplicate.status_code == 409
    invalid = admin_client.post(
        "/api/admin/catalog/majors",
        json={
            "name": "IT",
            "major_code": 1,
            "faculty_id": 999,
            "study_form": "present",
            "duration_yrs": 4,
        },
    )
    assert invalid.status_code == 422
    valid = admin_client.post(
        "/api/admin/catalog/majors",
        json={
            "name": "IT",
            "major_code": 1,
            "faculty_id": faculty.json()["id"],
            "study_form": "present",
            "duration_yrs": 4,
        },
    )
    assert valid.status_code == 201, valid.text
    assert (
        admin_client.delete(
            f"/api/admin/catalog/faculties/{faculty.json()['id']}"
        ).status_code
        == 409
    )


def test_unknown_fields_are_rejected_without_echoing_password(admin_client):
    response = admin_client.post(
        "/api/admin/catalog/faculties",
        json={"name": "A", "code": "A", "password": "secret123"},
    )
    assert response.status_code == 422
    assert "secret123" not in response.text


def test_cannot_disable_current_admin(admin_client):
    response = admin_client.put(
        "/api/admin/catalog/users/1",
        json={
            "email": "admin@example.invalid",
            "display_name": "Administrator",
            "role": "admin",
            "is_active": False,
        },
    )
    assert response.status_code == 409


def test_unconfirmed_calendar_can_store_unknown_units(admin_client):
    body = {
        "name": "Pending part-time",
        "study_form": "remote",
        "first_start": "09:30",
        "lesson_minutes": 80,
        "break_minutes": 10,
        "break_overrides": {"2": 30},
        "weekdays": [0, 1, 2, 3, 4],
        "ordinary_slots": 5,
    }
    result = admin_client.post("/api/admin/catalog/calendars", json=body)
    assert result.status_code == 201, result.text
    assert result.json()["academic_hours_per_lesson"] is None
    assert result.json()["confirmed"] is False
    body["confirmed"] = True
    assert (
        admin_client.post("/api/admin/catalog/calendars", json=body).status_code == 422
    )
