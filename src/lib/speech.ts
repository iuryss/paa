/** "Ouvir": leitura sob demanda (nunca automática). Usa a voz do próprio aparelho. */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang = "pt-BR"): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // um pouco mais devagar
  utterance.volume = 0.8; // nunca no máximo
  window.speechSynthesis.speak(utterance);
}
