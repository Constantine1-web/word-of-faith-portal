"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { updateProfile } from "@/app/actions/profile";
import { useSession } from "next-auth/react";
import {
  FiCamera,
  FiUpload,
  FiTrash2,
  FiZoomIn,
  FiMove,
  FiCheckCircle,
  FiShield,
  FiRefreshCw,
  FiX,
  FiCreditCard,
} from "react-icons/fi";
import StudentIdCardStudio from "@/components/portal/StudentIdCardStudio";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showIdCardModal, setShowIdCardModal] = useState(false);

  // Interactive Avatar Studio State (Upload, Camera Capture, Crop & Reposition, Preview, Remove)
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [removeAvatarFlag, setRemoveAvatarFlag] = useState(false);

  // Live Camera Capture State
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const res = await getStudentProfile(parseInt((session.user as any).id, 10));
        if (res.success) setProfile(res.student);
        setLoading(false);
      }
    }
    load();
  }, [session]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Re-render 300x300 cropped preview whenever rawImageSrc, zoom, or offset changes
  const renderCropCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    const scale = Math.max(size / img.width, size / img.height) * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (size - drawW) / 2 + offset.x;
    const drawY = (size - drawH) / 2 + offset.y;

    ctx.fillStyle = "#0A2540";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    setCroppedPreviewUrl(dataUrl);
  }, [zoom, offset]);

  useEffect(() => {
    if (!rawImageSrc) return;
    const img = new Image();
    img.onload = () => {
      loadedImgRef.current = img;
      renderCropCanvas();
    };
    img.src = rawImageSrc;
  }, [rawImageSrc, renderCropCanvas]);

  useEffect(() => {
    if (loadedImgRef.current && rawImageSrc) {
      renderCropCanvas();
    }
  }, [zoom, offset, rawImageSrc, renderCropCanvas]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setStatus(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRawImageSrc(reader.result);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setRemoveAvatarFlag(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async (mode: "user" | "environment" = facingMode) => {
    stopCamera();
    setStatus(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = mediaStream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setStatus({
        type: "error",
        text: "Unable to access device camera. Please allow camera permissions or upload an image from your device.",
      });
    }
  };

  const captureCameraFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth || 640;
    tempCanvas.height = video.videoHeight || 640;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.92);
    stopCamera();
    setRawImageSrc(dataUrl);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRemoveAvatarFlag(false);
  };

  const handleRemoveAvatar = () => {
    stopCamera();
    setRawImageSrc(null);
    setCroppedPreviewUrl(null);
    setRemoveAvatarFlag(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCancelCrop = () => {
    setRawImageSrc(null);
    setCroppedPreviewUrl(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const formData = new FormData(e.currentTarget);
    if (removeAvatarFlag) {
      formData.set("removeAvatar", "true");
    } else if (croppedPreviewUrl) {
      formData.set("croppedAvatarDataUrl", croppedPreviewUrl);
    }

    const res = await updateProfile(formData);
    setSaving(false);

    if (res.success) {
      setStatus({ type: "success", text: res.message || "Profile saved!" });
      setRawImageSrc(null);
      setCroppedPreviewUrl(null);
      setRemoveAvatarFlag(false);
      if (session?.user) {
        const pRes = await getStudentProfile(parseInt((session.user as any).id, 10));
        if (pRes.success) setProfile(pRes.student);
      }
    } else {
      setStatus({ type: "error", text: res.error || "Failed to update profile." });
    }
  };

  if (loading) {
    return <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>Loading profile...</div>;
  }

  const displayedAvatar = removeAvatarFlag
    ? null
    : croppedPreviewUrl || profile?.avatarUrl || null;

  const initials = (profile?.fullName || profile?.preferredName || "ST")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          borderBottom: "2px solid var(--border-subtle)",
          paddingBottom: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--text-heading)", margin: 0 }}>
            Student Profile &amp; Picture Manager
          </h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.92rem" }}>
            Manage your portal display picture and contact details. Your WOFS Student ID and identity verification status remain permanently protected.
          </p>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.45rem 0.9rem",
            borderRadius: "var(--radius-full)",
            background: "var(--status-success-bg)",
            color: "var(--status-success-text)",
            border: "1px solid var(--status-success-border)",
            fontSize: "0.82rem",
            fontWeight: 700,
          }}
        >
          <FiShield />
          <span>
            {profile?.identityVerified
              ? "Identity Verified"
              : "Account Active · Independent Profile Avatar"}
          </span>
        </div>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
          padding: "clamp(1.25rem, 3vw, 2rem)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          maxWidth: "920px",
        }}
      >
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Left Column: Avatar Preview, Camera & Cropper Studio */}
          <div
            style={{
              flex: "1 1 280px",
              maxWidth: "340px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
              background: "var(--bg-secondary)",
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {/* Current / Live Preview Avatar Circle */}
            <div
              style={{
                width: "160px",
                height: "160px",
                borderRadius: "50%",
                background: "var(--bg-tertiary)",
                border: "4px solid var(--brand-primary)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--shadow-md)",
                position: "relative",
              }}
            >
              {displayedAvatar ? (
                <img
                  src={displayedAvatar}
                  alt="Student Profile Picture"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-heading)",
                    fontWeight: 800,
                    fontSize: "2.5rem",
                  }}
                >
                  {initials || "👤"}
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    Default Avatar
                  </span>
                </div>
              )}
            </div>

            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: "var(--text-heading)",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  padding: "0.25rem 0.75rem",
                  borderRadius: "var(--radius-full)",
                  display: "inline-block",
                }}
              >
                {profile?.wofsStudentId || profile?.admissionNo || "WOFS-STU"}
              </div>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Changing your profile picture never alters your identity verification record.
              </p>
              {profile?.wofsStudentId && !String(profile?.admissionNo || "").startsWith("STAFF-") && (
                <button
                  type="button"
                  onClick={() => setShowIdCardModal(true)}
                  className="btn btn-outline"
                  style={{
                    marginTop: "0.65rem",
                    padding: "0.42rem 0.85rem",
                    fontSize: "0.8rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <FiCreditCard size={14} /> View &amp; Print My ID Card
                </button>
              )}
            </div>

            {/* Action Buttons: Upload, Camera, Remove */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", width: "100%" }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary"
                style={{
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <FiUpload /> {displayedAvatar ? "Replace Image" : "Upload Photo"}
              </button>

              <button
                type="button"
                onClick={() => (cameraActive ? stopCamera() : startCamera("user"))}
                className="btn btn-outline"
                style={{
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.82rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <FiCamera /> {cameraActive ? "Close Camera" : "Use Camera"}
              </button>

              {(displayedAvatar || profile?.avatarUrl) && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  style={{
                    padding: "0.5rem 0.85rem",
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: "var(--status-error-bg)",
                    color: "var(--status-error-text)",
                    border: "1px solid var(--status-error-border)",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <FiTrash2 /> Remove
                </button>
              )}
            </div>

            {/* Live Camera Stream Box */}
            {cameraActive && (
              <div
                style={{
                  width: "100%",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.75rem",
                  textAlign: "center",
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    maxHeight: "220px",
                    borderRadius: "8px",
                    background: "#000",
                    objectFit: "cover",
                  }}
                />
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "0.65rem" }}>
                  <button
                    type="button"
                    onClick={captureCameraFrame}
                    className="btn btn-primary"
                    style={{ padding: "0.45rem 0.9rem", fontSize: "0.82rem" }}
                  >
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextMode = facingMode === "user" ? "environment" : "user";
                      setFacingMode(nextMode);
                      startCamera(nextMode);
                    }}
                    className="btn btn-outline"
                    style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
                  >
                    <FiRefreshCw /> Flip
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Crop & Reposition Box */}
            {rawImageSrc && (
              <div
                style={{
                  width: "100%",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.85rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "var(--text-heading)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    <FiMove /> Drag to Reposition &amp; Crop
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelCrop}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                    title="Cancel crop"
                  >
                    <FiX size={16} />
                  </button>
                </div>

                <div
                  onMouseDown={(e) => {
                    setDragging(true);
                    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
                  }}
                  onMouseMove={(e) => {
                    if (!dragging) return;
                    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
                  }}
                  onMouseUp={() => setDragging(false)}
                  onMouseLeave={() => setDragging(false)}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    setDragging(true);
                    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
                  }}
                  onTouchMove={(e) => {
                    if (!dragging) return;
                    const touch = e.touches[0];
                    if (!touch) return;
                    setOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
                  }}
                  onTouchEnd={() => setDragging(false)}
                  style={{
                    width: "200px",
                    height: "200px",
                    margin: "0 auto",
                    borderRadius: "12px",
                    overflow: "hidden",
                    cursor: dragging ? "grabbing" : "grab",
                    border: "2px dashed var(--brand-primary)",
                    touchAction: "none",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{ width: "100%", height: "100%", display: "block" }}
                  />
                </div>

                <div style={{ marginTop: "0.75rem" }}>
                  <label
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <FiZoomIn /> Zoom ({Math.round(zoom * 100)}%)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1);
                        setOffset({ x: 0, y: 0 });
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--brand-primary)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Reset
                    </button>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Profile Details Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              flex: "2 1 320px",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              minWidth: "min(100%, 280px)",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: "1rem",
              }}
            >
              <div>
                <label className="form-label">Permanent WOFS Student ID</label>
                <input
                  type="text"
                  value={profile?.wofsStudentId || profile?.admissionNo || ""}
                  disabled
                  className="form-input"
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 700,
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    cursor: "not-allowed",
                  }}
                />
                <small style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  System-generated permanent school ID (cannot be modified).
                </small>
              </div>

              <div>
                <label className="form-label">Assigned Class &amp; Arm</label>
                <input
                  type="text"
                  value={profile?.className || ""}
                  disabled
                  className="form-input"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    cursor: "not-allowed",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: "1rem",
              }}
            >
              <div>
                <label className="form-label">Preferred Display Name</label>
                <input
                  type="text"
                  name="preferredName"
                  defaultValue={profile?.preferredName || profile?.fullName || ""}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Portal Login Email</label>
                <input
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  className="form-input"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    cursor: "not-allowed",
                  }}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Parent / Guardian Phone Number</label>
              <input
                type="tel"
                name="parentContact"
                defaultValue={profile?.parentContact || ""}
                className="form-input"
                placeholder="e.g. 08031234567"
              />
              <small style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                Used for official SMS &amp; WhatsApp school notifications.
              </small>
            </div>

            {status && (
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  background:
                    status.type === "error" ? "var(--status-error-bg)" : "var(--status-success-bg)",
                  color:
                    status.type === "error"
                      ? "var(--status-error-text)"
                      : "var(--status-success-text)",
                  border: `1px solid ${
                    status.type === "error"
                      ? "var(--status-error-border)"
                      : "var(--status-success-border)"
                  }`,
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <FiCheckCircle />
                <span>{status.text}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ padding: "0.75rem 2rem" }}
              >
                {saving ? "Saving Profile..." : "Save Profile Changes"}
              </button>
              {(croppedPreviewUrl || removeAvatarFlag) && (
                <span style={{ fontSize: "0.82rem", color: "var(--status-warning-text)", fontWeight: 600 }}>
                  Unsaved picture change ready — click &ldquo;Save Profile Changes&rdquo; to apply.
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {showIdCardModal && profile?.wofsStudentId && (
        <StudentIdCardStudio
          students={[
            {
              AdmissionNo: profile.wofsStudentId,
              verificationSig: profile.verificationSig,
              FirstName: profile.firstName,
              MiddleName: profile.middleName,
              LastName: profile.lastName,
              PreferredName: profile.preferredName || profile.fullName,
              AvatarUrl: displayedAvatar || profile.avatarUrl,
              EnrolmentStatus: "ACTIVE",
              className: profile.className,
              classLevel: profile.level,
            },
          ]}
          onClose={() => setShowIdCardModal(false)}
          sessionLabel={profile.sessionName || "2026/2027"}
          title="My Official Word of Faith Student ID Card"
        />
      )}
    </div>
  );
}
