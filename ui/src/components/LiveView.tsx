import { useEffect, useRef } from "react";

type Props = {
    img?: string;
};

export function LiveViewBrowser({ img }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const image = new Image();

        image.onload = () => {
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            ctx.drawImage(image, 0, 0);
        };

        image.src = `data:image/png;base64,${img}`;

        return () => {
            image.onload = null;
        };
    }, [img]);

    return (
        <canvas
            ref={canvasRef}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
        />
    );
}