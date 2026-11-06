export type Recording = {
  /** 16 kHz mono 16-bit WAV, for scoring. */
  wav: Uint8Array;
  /** The same audio as samples, for the pitch curve. */
  samples: Float32Array;
  /** Playable file / blob URL. */
  uri: string;
  durationMs: number;
};

export type Recorder = {
  /** Asks for the microphone if needed; false if not allowed. */
  start: () => Promise<boolean>;
  stop: () => Promise<Recording | null>;
  recording: boolean;
  error: string | null;
};
