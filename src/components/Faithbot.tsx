"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import { FiMessageCircle, FiX, FiMaximize2, FiMinimize2, FiPaperclip, FiSend } from "react-icons/fi";

export default function Faithbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [localInput, setLocalInput] = useState("");
  
  // Drag state for button
  const [btnPos, setBtnPos] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  // Drag state for popup interface
  const [popupPos, setPopupPos] = useState<{ x: number, y: number } | null>(null);
  const [isDraggingPopup, setIsDraggingPopup] = useState(false);
  const popupDragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const handlePopupPointerDown = (e: React.PointerEvent) => {
    if (isFullScreen) return;
    setIsDraggingPopup(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    popupDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: rect.left,
      initialY: rect.top
    };
  };

  const handlePopupPointerMove = (e: React.PointerEvent) => {
    if (!popupDragRef.current) return;
    setIsDraggingPopup(true);
    const dx = e.clientX - popupDragRef.current.startX;
    const dy = e.clientY - popupDragRef.current.startY;
    setPopupPos({
      x: popupDragRef.current.initialX + dx,
      y: popupDragRef.current.initialY + dy
    });
  };

  const handlePopupPointerUp = (e: React.PointerEvent) => {
    if (!popupDragRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    popupDragRef.current = null;
    setIsDraggingPopup(false);
  };

  useEffect(() => {
    // Set initial position after mount to avoid hydration mismatch
    // Raise it up higher from the bottom
    setBtnPos({ x: 32, y: window.innerHeight - 150 }); 
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(false);
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: rect.left,
      initialY: rect.top
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    setIsDragging(true);
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.startX;
    const dy = touch.clientY - dragRef.current.startY;
    setBtnPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  };

  const handleTouchEnd = () => {
    if (!dragRef.current || !btnPos) return;
    dragRef.current = null;
    
    const screenWidth = window.innerWidth;
    const buttonWidth = 60;
    
    let finalX = btnPos.x;
    if (finalX + buttonWidth / 2 > screenWidth / 2) {
      finalX = screenWidth - buttonWidth - 16;
    } else {
      finalX = 16;
    }

    let finalY = btnPos.y;
    const screenHeight = window.innerHeight;
    const buttonHeight = 60;
    const paddingBottom = 80;
    if (finalY < 16) finalY = 16;
    if (finalY > screenHeight - buttonHeight - paddingBottom) finalY = screenHeight - buttonHeight - paddingBottom;

    setBtnPos({ x: finalX, y: finalY });
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      setIsDragging(false);
      return;
    }
    setIsOpen(!isOpen);
  };
  
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const append = async (message: any) => {
    const newMessages = [...messages, message];
    setMessages(newMessages);
    setIsLoading(true);
    setError(null);
    
    const botId = String(Date.now());
    setMessages(prev => [...prev, { id: botId, role: "assistant", content: "" }]);
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages })
      });
      
      if (!res.ok) throw new Error("Failed to fetch response");
      if (!res.body) throw new Error("No response body");
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let botContent = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text-delta') {
                const textChunk = data.delta || data.textDelta || "";
                botContent += textChunk;
                setMessages(prev => 
                  prev.map(m => m.id === botId ? { ...m, content: botContent } : m)
                );
              } else if (data.type === 'error') {
                let errorMsg = data.error || data.errorText || "Unknown server error";
                if (errorMsg === "An error occurred.") {
                  errorMsg = "API Rate Limit Exceeded. Please wait a minute and try again.";
                }
                botContent += `\n[Error: ${errorMsg}]`;
                setMessages(prev => 
                  prev.map(m => m.id === botId ? { ...m, content: botContent } : m)
                );
                setError(new Error(errorMsg));
              }
            } catch (err) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (e: any) {
      console.error("Manual stream error:", e);
      setError(e);
    } finally {
      setIsLoading(false);
    }
  };

  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() && (!files || files.length === 0)) return;
    if (isLoading) return;
    
    let finalContent = localInput;

    if (files && files.length > 0) {
      const base64s = await Promise.all(
        Array.from(files).map(async (file) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxSize = 800;
                if (width > height && width > maxSize) {
                  height *= maxSize / width;
                  width = maxSize;
                } else if (height > maxSize) {
                  width *= maxSize / height;
                  height = maxSize;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
              };
              img.onerror = reject;
              img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );
      finalContent += (finalContent ? "\n\n" : "") + base64s.map(b64 => `[ATTACHMENT:${b64}]`).join("\n");
    }
    
    append({ 
      id: String(Date.now()) + Math.random().toString(36).substring(7),
      role: "user", 
      content: finalContent || "Image attached"
    });
    
    setLocalInput("");
    setFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <style>{`
        @keyframes faithbot-float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
          100% { transform: translateY(0px); }
        }
      `}</style>

      <button 
        type="button"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          top: btnPos ? `${btnPos.y}px` : "auto",
          left: btnPos ? `${btnPos.x}px` : "2rem",
          bottom: btnPos ? "auto" : "2rem",
          background: isOpen ? "var(--bg-dark)" : "#000000",
          color: "white",
          borderRadius: "50%",
          width: "clamp(45px, 12vw, 60px)",
          height: "clamp(45px, 12vw, 60px)",
          border: "none",
          boxShadow: "var(--shadow-lg)",
          cursor: isDragging ? "grabbing" : "pointer",
          zIndex: 9999,
          fontSize: "clamp(1.2rem, 4vw, 1.5rem)",
          display: isOpen && isFullScreen ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: isDragging ? "none" : "top 0.3s, left 0.3s, background 0.3s",
          animation: (isOpen || isDragging) ? "none" : "faithbot-float 3s ease-in-out infinite",
          touchAction: "none"
        }}
      >
        {isOpen ? <FiX /> : <FiMessageCircle />}
      </button>

      {isOpen && (
        <div style={{
          position: "fixed",
          bottom: isFullScreen ? "0" : (popupPos ? "auto" : "5rem"),
          left: isFullScreen ? "0" : (popupPos ? `${popupPos.x}px` : "1rem"),
          top: isFullScreen ? "0" : (popupPos ? `${popupPos.y}px` : "auto"),
          width: isFullScreen ? "100vw" : "min(350px, 85vw)",
          height: isFullScreen ? "100vh" : "min(500px, 65vh)",
          background: "var(--nav-bg-glass)",
          backdropFilter: "blur(16px) saturate(180%)",
          WebkitBackdropFilter: "blur(16px) saturate(180%)", // iOS Safari support
          borderRadius: isFullScreen ? "0" : "var(--radius-lg)",
          boxShadow: isFullScreen ? "none" : "var(--shadow-floating)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: isFullScreen ? "none" : "1px solid var(--color-gray-200)",
          transition: isDraggingPopup ? "none" : "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}>
          <div 
            onPointerDown={handlePopupPointerDown}
            onPointerMove={handlePopupPointerMove}
            onPointerUp={handlePopupPointerUp}
            onPointerCancel={handlePopupPointerUp}
            style={{ 
              background: "rgba(30, 58, 138, 0.95)", // slightly transparent navy
              color: "white", 
              padding: "1rem", 
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "bold",
              cursor: isDraggingPopup ? "grabbing" : (isFullScreen ? "default" : "grab"),
              touchAction: "none"
            }}
          >
            <span style={{ fontSize: "clamp(1rem, 4vw, 1.1rem)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Faithbot Support
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }} onPointerDown={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "1.2rem", padding: "0 0.5rem" }}
                title={isFullScreen ? "Collapse" : "Expand Fullscreen"}
              >
                {isFullScreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: "1.2rem", padding: "0 0.5rem" }}
                title="Close"
              >
                <FiX />
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(!messages || messages.length === 0) && <p style={{ textAlign: "center", color: "var(--color-gray-800)", marginTop: "1rem" }}>Hello! How can I help you today?</p>}
            {messages?.map((m, index) => (
              <div key={m.id || `msg-${index}`} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: "85%",
              }}>
                <div style={{ 
                  margin: 0, 
                  background: m.role === 'user' ? "var(--color-primary-green)" : "var(--color-gray-100)",
                  color: m.role === 'user' ? "var(--btn-primary-text, white)" : "var(--color-gray-900)",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-sm)",
                  fontSize: "0.95rem",
                  lineHeight: "1.4"
                }}>
                  {(() => {
                    const content = m.content || "";
                    if (typeof content === 'string' && content.includes('[ATTACHMENT:')) {
                      const textOnly = content.replace(/\[ATTACHMENT:data:[^;]+;base64,[^\]]+\]/g, '').trim();
                      const images = Array.from(content.matchAll(/\[ATTACHMENT:(data:[^;]+;base64,[^\]]+)\]/g)).map(match => match[1]);
                      
                      return (
                        <>
                          {textOnly && <span>{textOnly}</span>}
                          {images.map((url, idx) => (
                            <div key={idx} style={{ marginTop: "0.5rem" }}>
                              <img src={url} alt="attachment" style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px", objectFit: "contain" }} />
                            </div>
                          ))}
                        </>
                      );
                    }
                    return <span>{content}</span>;
                  })()}
                </div>
              </div>
            ))}
            {isLoading && <div style={{ alignSelf: "flex-start", color: "var(--color-gray-800)", fontStyle: "italic", fontSize: "0.9rem" }}>Faithbot is typing...</div>}
            {error && (
              <div style={{ alignSelf: "center", color: "red", fontSize: "0.8rem", textAlign: "center", padding: "0.5rem" }}>
                Error: {error.message || "Failed to fetch response."}
              </div>
            )}
          </div>
          
          <form onSubmit={onSubmit} style={{ padding: "1rem", borderTop: "1px solid var(--color-gray-200)", display: "flex", flexDirection: "column", gap: "0.5rem", background: "var(--color-gray-50)" }}>
            {files && files.length > 0 && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-primary-green)", background: "var(--color-white)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary-green)", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <FiPaperclip /> {files[0].name}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input 
                type="file" 
                accept="image/*"
                ref={fileInputRef}
                onChange={(e) => setFiles(e.target.files)}
                style={{ display: "none" }}
                id="faithbot-file-upload"
              />
              <label htmlFor="faithbot-file-upload" style={{ cursor: "pointer", padding: "0.75rem", color: "var(--color-gray-700)", background: "var(--color-white)", border: "1px solid var(--color-gray-300)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Upload Image">
                <FiPaperclip size={20} />
              </label>
              <input 
                value={localInput} 
                onChange={(e) => setLocalInput(e.target.value)} 
                placeholder="Ask Faithbot..." 
                style={{ flex: 1, minWidth: 0, padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)", background: "var(--color-white)", color: "var(--color-gray-900)" }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }} disabled={isLoading || (!localInput.trim() && (!files || files.length === 0))}>
                <FiSend size={20} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
