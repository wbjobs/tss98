import { useRef, useEffect } from "react";
import { useVoiceStore } from "@/stores/voiceStore";

export default function WaveformVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const { isListening, waveformData } = useVoiceStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const midY = height / 2;

      if (!isListening || waveformData.length === 0) {
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.strokeStyle = "#00FFC8";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const step = width / (waveformData.length - 1);

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(0, 255, 200, 0)");
      gradient.addColorStop(0.5, "rgba(0, 255, 200, 0.15)");
      gradient.addColorStop(1, "rgba(0, 255, 200, 0)");

      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * step;
        const y = midY + waveformData[i] * midY * 0.8;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(width, midY);

      const fillPath = new Path2D();
      fillPath.moveTo(0, midY);
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * step;
        const y = midY + waveformData[i] * midY * 0.8;
        if (i === 0) {
          fillPath.moveTo(x, y);
        } else {
          fillPath.lineTo(x, y);
        }
      }
      fillPath.lineTo(width, midY);
      fillPath.lineTo(width, height);
      fillPath.lineTo(0, height);
      fillPath.closePath();
      ctx.fillStyle = gradient;
      ctx.fill(fillPath);

      const strokeGradient = ctx.createLinearGradient(0, 0, width, 0);
      strokeGradient.addColorStop(0, "rgba(0, 255, 200, 0.1)");
      strokeGradient.addColorStop(0.5, "rgba(0, 255, 200, 0.8)");
      strokeGradient.addColorStop(1, "rgba(0, 255, 200, 0.1)");

      ctx.beginPath();
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * step;
        const y = midY + waveformData[i] * midY * 0.8;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = strokeGradient;
      ctx.lineWidth = 2;
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resizeCanvas();
    animationRef.current = requestAnimationFrame(draw);

    window.addEventListener("resize", resizeCanvas);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [isListening, waveformData]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: "100px" }}
    />
  );
}
