import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useState } from 'react';

import { decodeWav, encodeWav, resample } from '@/lib/pitch';
import type { Recording, Recorder } from '@/lib/recorder.types';

/** 16 kHz mono 16-bit WAV: what Azure pronunciation assessment accepts. */
const OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: { extension: '.wav', outputFormat: 'default', audioEncoder: 'default' },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

/** iPhone: records with expo-audio, then reads the WAV file back. */
export function useRecorder(): Recorder {
  const recorder = useAudioRecorder(OPTIONS);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is off. Turn it on in Settings → HSK Chinese → Microphone.');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    return true;
  }

  async function stop(): Promise<Recording | null> {
    if (!recording) return null;
    setRecording(false);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri) {
      setError("Couldn't save the recording. Try again.");
      return null;
    }
    const raw = decodeWav(new Uint8Array(await new File(uri).arrayBuffer()));
    const samples = resample(raw.samples, raw.sampleRate, 16000);
    return { wav: encodeWav(samples, 16000), samples, uri, durationMs: Math.round((samples.length / 16000) * 1000) };
  }

  return { start, stop, recording, error };
}
