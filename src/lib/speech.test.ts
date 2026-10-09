import { canSpeak, speak } from "./speech";

class FakeUtterance {
  lang = "";
  rate = 1;
  volume = 1;
  constructor(public text: string) {}
}

describe("speech", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    delete (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
  });

  it("não faz nada quando o aparelho não tem voz", () => {
    expect(canSpeak()).toBe(false);
    expect(() => speak("oi")).not.toThrow();
  });

  it("fala em pt-BR, devagar e sem volume máximo, cancelando a fala anterior", () => {
    const synth = { cancel: jest.fn(), speak: jest.fn() };
    Object.assign(window, { speechSynthesis: synth });
    Object.assign(globalThis, { SpeechSynthesisUtterance: FakeUtterance });

    expect(canSpeak()).toBe(true);
    speak("Onde fica a escola?");

    expect(synth.cancel).toHaveBeenCalled();
    const utterance = synth.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(utterance).toMatchObject({ text: "Onde fica a escola?", lang: "pt-BR", rate: 0.9, volume: 0.8 });
  });
});
