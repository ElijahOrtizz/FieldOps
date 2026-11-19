"""Receipt file storage: private S3 bucket when S3_BUCKET is set, local disk otherwise.

Files are never served from a public folder. Reads go through an authenticated
API route (see routers/time_entries.py), so this module only saves and loads bytes.
"""
import os

LOCAL_DIR = "uploads"


def _bucket():
    return os.getenv("S3_BUCKET", "").strip()


def _s3():
    import boto3  # imported lazily so local dev and tests need no AWS setup
    return boto3.client("s3", region_name=os.getenv("AWS_REGION") or None)


def save(key: str, data: bytes, content_type: str) -> str:
    """Store bytes under key. Returns the location string kept in the database."""
    bucket = _bucket()
    if bucket:
        _s3().put_object(
            Bucket=bucket, Key=f"receipts/{key}", Body=data,
            ContentType=content_type, ServerSideEncryption="AES256",
        )
        return f"s3://{bucket}/receipts/{key}"
    os.makedirs(LOCAL_DIR, exist_ok=True)
    path = os.path.join(LOCAL_DIR, key)
    with open(path, "wb") as f:
        f.write(data)
    return path


def load(location: str) -> bytes:
    """Read bytes back from a location string returned by save()."""
    if location.startswith("s3://"):
        bucket, _, key = location[5:].partition("/")
        return _s3().get_object(Bucket=bucket, Key=key)["Body"].read()
    with open(location, "rb") as f:
        return f.read()
