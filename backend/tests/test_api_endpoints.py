"""Comprehensive tests for all FastAPI REST endpoints in ZhViSub."""

import io
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.db import Job, SegmentModel, init_db, SessionLocal
from app.main import app
from tests.test_ffmpeg_real import create_synthetic_video, create_synthetic_audio


@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestSystemEndpoints:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_voices(self, client):
        resp = client.get("/voices")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any("HoaiMy" in v["name"] or "vi-VN" in v["locale"] for v in data)


class TestJobEndpoints:
    def test_create_job_with_file_upload(self, client, tmp_path):
        # Create a real small mp4 file to upload
        test_video = tmp_path / "upload_test.mp4"
        create_synthetic_video(test_video, duration_s=2, width=320, height=240)

        with open(test_video, "rb") as f:
            resp = client.post(
                "/jobs",
                files={"file": ("my_video.mp4", f, "video/mp4")},
                data={
                    "blur": "true",
                    "dub": "false",
                    "font_size": "24",
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        job_id = data["id"]
        assert data["status"] == "pending"

        # Check job status
        status_resp = client.get(f"/jobs/{job_id}")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["id"] == job_id
        assert status_data["video_filename"] == "my_video.mp4"
        assert status_data["video_width"] == 320
        assert status_data["video_height"] == 240

    def test_list_jobs(self, client):
        resp = client.get("/jobs?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_job_not_found(self, client):
        resp = client.get("/jobs/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
        data = resp.json()
        assert data["code"] == "JOB_NOT_FOUND"
        assert "Không tìm thấy" in data["message"]

    def test_segments_get_and_put(self, client, db_session, tmp_path):
        # Create a job directly in DB
        import uuid
        job_id = str(uuid.uuid4())
        job = Job(id=job_id, status="completed", video_filename="test.mp4")
        db_session.add(job)

        seg1 = SegmentModel(job_id=job_id, segment_index=1, start=1.0, end=3.0, zh="你好", vi="Xin chào")
        seg2 = SegmentModel(job_id=job_id, segment_index=2, start=3.5, end=5.0, zh="再见", vi="Tạm biệt")
        db_session.add_all([seg1, seg2])
        db_session.commit()

        # 1. GET segments
        resp = client.get(f"/jobs/{job_id}/segments")
        assert resp.status_code == 200
        segs = resp.json()
        assert len(segs) == 2
        assert segs[0]["zh"] == "你好"
        assert segs[0]["vi"] == "Xin chào"

        # 2. PUT segments (edit translation)
        update_payload = {
            "segments": [
                {"id": 1, "start": 1.0, "end": 3.0, "zh": "你好", "vi": "Chào bạn nhé", "dub_text": "Chào bạn"},
                {"id": 2, "start": 3.5, "end": 5.0, "zh": "再见", "vi": "Hẹn gặp lại", "dub_text": "Gặp lại"},
            ]
        }
        put_resp = client.put(f"/jobs/{job_id}/segments", json=update_payload)
        assert put_resp.status_code == 200

        # Verify updated
        verify_resp = client.get(f"/jobs/{job_id}/segments")
        verify_segs = verify_resp.json()
        assert verify_segs[0]["vi"] == "Chào bạn nhé"
        assert verify_segs[0]["dub_text"] == "Chào bạn"
        assert verify_segs[1]["vi"] == "Hẹn gặp lại"

    def test_video_streaming_and_range(self, client, db_session):
        # Create a job with input video file
        import uuid
        from app.config import settings
        job_id = str(uuid.uuid4())
        job_dir = settings.get_job_dir(job_id)
        vid_file = job_dir / "input_video.mp4"
        create_synthetic_video(vid_file, duration_s=1, width=160, height=120)

        job = Job(id=job_id, status="completed")
        db_session.add(job)
        db_session.commit()

        # Test full video (200)
        resp_full = client.get(f"/jobs/{job_id}/video")
        assert resp_full.status_code == 200
        assert resp_full.headers["Accept-Ranges"] == "bytes"
        assert len(resp_full.content) == vid_file.stat().st_size

        # Test Range request (206)
        resp_range = client.get(f"/jobs/{job_id}/video", headers={"Range": "bytes=0-1023"})
        assert resp_range.status_code == 206
        assert "Content-Range" in resp_range.headers
        assert resp_range.headers["Content-Length"] == "1024"
        assert len(resp_range.content) == 1024

    def test_frame_extraction(self, client, db_session):
        import uuid
        from app.config import settings
        job_id = str(uuid.uuid4())
        job_dir = settings.get_job_dir(job_id)
        vid_file = job_dir / "input_video.mp4"
        create_synthetic_video(vid_file, duration_s=2, width=320, height=240)

        job = Job(id=job_id, status="completed")
        db_session.add(job)
        db_session.commit()

        resp = client.get(f"/jobs/{job_id}/frame?t=0.5")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"
        assert len(resp.content) > 100

    def test_download_artifacts(self, client, db_session):
        import uuid
        from app.config import settings
        job_id = str(uuid.uuid4())
        job_dir = settings.get_job_dir(job_id)

        # Create dummy artifacts
        (job_dir / "output.mp4").write_bytes(b"dummy mp4 data")
        (job_dir / "vi.srt").write_text("1\n00:00:01,000 --> 00:00:02,000\nTest\n", encoding="utf-8")
        (job_dir / "zh.srt").write_text("1\n00:00:01,000 --> 00:00:02,000\n测试\n", encoding="utf-8")
        (job_dir / "dub.wav").write_bytes(b"dummy wav data")

        job = Job(id=job_id, status="completed")
        db_session.add(job)
        db_session.commit()

        # Download mp4
        resp_mp4 = client.get(f"/jobs/{job_id}/download?type=mp4")
        assert resp_mp4.status_code == 200
        assert resp_mp4.content == b"dummy mp4 data"

        # Download vi srt
        resp_vi = client.get(f"/jobs/{job_id}/download?type=srt_vi")
        assert resp_vi.status_code == 200
        assert "Test" in resp_vi.text

        # Download zh srt
        resp_zh = client.get(f"/jobs/{job_id}/download?type=srt_zh")
        assert resp_zh.status_code == 200
        assert "测试" in resp_zh.text

        # Download dub
        resp_dub = client.get(f"/jobs/{job_id}/download?type=dub")
        assert resp_dub.status_code == 200
        assert resp_dub.content == b"dummy wav data"

    def test_cancel_job(self, client, db_session):
        import uuid
        job_id = str(uuid.uuid4())
        job = Job(id=job_id, status="processing")
        db_session.add(job)
        db_session.commit()

        resp = client.post(f"/jobs/{job_id}/cancel")
        assert resp.status_code == 200

        # Verify status is cancelled
        check_resp = client.get(f"/jobs/{job_id}")
        assert check_resp.json()["status"] == "cancelled"

    def test_delete_job(self, client, db_session):
        import uuid
        from app.config import settings
        job_id = str(uuid.uuid4())
        job_dir = settings.get_job_dir(job_id)
        (job_dir / "test.txt").write_text("temporary data")

        job = Job(id=job_id, status="completed")
        db_session.add(job)
        db_session.commit()

        del_resp = client.delete(f"/jobs/{job_id}")
        assert del_resp.status_code == 200

        # Check job removed from DB
        get_resp = client.get(f"/jobs/{job_id}")
        assert get_resp.status_code == 404

        # Check directory deleted
        assert not job_dir.exists()
