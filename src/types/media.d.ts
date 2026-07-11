export type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fps: number;
};

export type IngestionResult = {
  audioObjectKey: string;
  metadataObjectKey: string;
  metadata: VideoMetadata;
  localAudioPath: string; // for Whisper in same worker run
};
