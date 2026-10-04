import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictado por voz. En la web usa el reconocimiento del navegador (Chrome, Edge, Safari).
 * En el celular, la app usa el micrófono del teclado (dictado del sistema).
 */
export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });
  const Klass = recognitionClass();

  useEffect(() => () => rec.current?.stop(), []);

  const start = () => {
    if (!Klass) return false;
    setError(null);
    const r = new Klass();
    r.lang = 'es-AR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final = e.results[i].isFinal;
      }
      cb.current(text, final);
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Hay que permitir el micrófono en el navegador.' : 'No te escuché bien, probá de nuevo.');
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
    return true;
  };

  const stop = () => rec.current?.stop();

  return { supported: Boolean(Klass), listening, error, start, stop };
}
