import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import current_host_id
from app.api.uplode import router as upload_router
from app.services.uplode import MAX_FILE_SIZE, PDF_SIGNATURE

HOST_ID = 1
PDF_BYTES = PDF_SIGNATURE + b"1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n"

NO_LOGIN_CHECK = (
    "POST /api/upload does not depend on current_host_id yet, so an unauthorised "
    "request is accepted. Remove this marker when the route requires a login."
)

# These tests build their own small app with only the upload route. They need no
# database, so they do not use the fixtures in conftest.py.


@pytest.fixture
def upload_app() -> FastAPI:
    app = FastAPI()
    app.include_router(upload_router, prefix="/api")
    return app


@pytest.fixture
def client(upload_app: FastAPI) -> TestClient:
    return TestClient(upload_app)


@pytest.fixture
def host_client(upload_app: FastAPI) -> TestClient:
    upload_app.dependency_overrides[current_host_id] = lambda: HOST_ID
    return TestClient(upload_app)


def post_file(client: TestClient, filename: str, content: bytes):
    return client.post(
        "/api/upload",
        files={"file": (filename, content, "application/octet-stream")},
    )


# Success paths

def test_upload_valid_pdf_succeeds(host_client) -> None:
    response = post_file(host_client, "notes.pdf", PDF_BYTES)
    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "PDF uploaded and validated successfully."
    assert body["filename"] == "notes.pdf"
    assert body["size_bytes"] == len(PDF_BYTES)
    assert body["size_mb"] == round(len(PDF_BYTES) / (1024 * 1024), 2)


def test_upload_accepts_uppercase_extension(host_client) -> None:
    response = post_file(host_client, "NOTES.PDF", PDF_BYTES)
    assert response.status_code == 200
    assert response.json()["filename"] == "NOTES.PDF"


def test_upload_at_exact_size_limit_succeeds(host_client) -> None:
    content = PDF_SIGNATURE + b"0" * (MAX_FILE_SIZE - len(PDF_SIGNATURE))
    assert len(content) == MAX_FILE_SIZE
    response = post_file(host_client, "big.pdf", content)
    assert response.status_code == 200
    assert response.json()["size_bytes"] == MAX_FILE_SIZE


# Failure paths

@pytest.mark.parametrize("filename", ["notes.docx", "photo.png", "notes.txt", "pdf"])
def test_upload_wrong_file_type_returns_400(host_client, filename: str) -> None:
    response = post_file(host_client, filename, PDF_BYTES)
    assert response.status_code == 400
    assert "Only PDF files are allowed" in response.json()["detail"]


def test_upload_pdf_content_with_other_extension_returns_400(host_client) -> None:
    response = post_file(host_client, "notes.docx", PDF_BYTES)
    assert response.status_code == 400
    assert "Invalid file type" in response.json()["detail"]


def test_upload_pdf_extension_with_other_content_returns_400(host_client) -> None:
    response = post_file(host_client, "notes.pdf", b"this is plain text, not a pdf")
    assert response.status_code == 400
    assert "not a valid PDF signature" in response.json()["detail"]


def test_upload_empty_file_returns_400(host_client) -> None:
    response = post_file(host_client, "empty.pdf", b"")
    assert response.status_code == 400
    assert "not a valid PDF signature" in response.json()["detail"]


def test_upload_one_byte_over_limit_returns_413(host_client) -> None:
    content = PDF_SIGNATURE + b"0" * (MAX_FILE_SIZE + 1 - len(PDF_SIGNATURE))
    assert len(content) == MAX_FILE_SIZE + 1
    response = post_file(host_client, "huge.pdf", content)
    assert response.status_code == 413
    assert "Maximum allowed size is 10 MB" in response.json()["detail"]


def test_upload_without_file_field_returns_422(host_client) -> None:
    response = host_client.post("/api/upload")
    assert response.status_code == 422


def test_upload_with_wrong_field_name_returns_422(host_client) -> None:
    response = host_client.post(
        "/api/upload",
        files={"document": ("notes.pdf", PDF_BYTES, "application/pdf")},
    )
    assert response.status_code == 422


# Unauthorised request

@pytest.mark.xfail(strict=True, reason=NO_LOGIN_CHECK)
def test_upload_without_login_returns_401(client) -> None:
    response = post_file(client, "notes.pdf", PDF_BYTES)
    assert response.status_code == 401
