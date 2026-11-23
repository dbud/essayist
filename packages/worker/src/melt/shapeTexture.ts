import { type PackedFrame, ROWS } from "./pack.ts";

export interface ShapeTexture {
  /** Uploads the shapes of a frame and binds the texture to a texture unit. */
  upload(frame: PackedFrame, unit: number): void;
  dispose(): void;
}

/** The shapes of a frame as a float texture, read with texelFetch, so it needs no filtering and no
    extension. It is allocated again only when the number of shapes changes. */
export function createShapeTexture(gl: WebGL2RenderingContext): ShapeTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let columns = 0;

  return {
    upload(frame, unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (frame.count === columns) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          frame.count,
          ROWS,
          gl.RGBA,
          gl.FLOAT,
          frame.shapes,
        );
        return;
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        frame.count,
        ROWS,
        0,
        gl.RGBA,
        gl.FLOAT,
        frame.shapes,
      );
      columns = frame.count;
    },
    dispose() {
      gl.deleteTexture(texture);
    },
  };
}
