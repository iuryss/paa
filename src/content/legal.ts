import { TERMS_VERSION } from "@/lib/terms";

/**
 * Textos de privacidade e de consentimento, em linguagem simples (LGPD art. 9º e art. 14).
 * Descrevem EXATAMENTE o que o sistema faz hoje. Se o sistema mudar (novos dados, novos
 * compartilhamentos), estes textos precisam mudar junto e TERMS_VERSION deve ser incrementada.
 */
export interface LegalContext {
  /** Quem decide sobre os dados (o controlador): a escola/instituição. */
  controller: string;
  /** Como falar com o encarregado (DPO). */
  contact: string;
  /** false enquanto o jurídico não aprovou: a página mostra o aviso de "versão de trabalho". */
  reviewed: boolean;
  version: string;
}

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

type Env = Record<string, string | undefined>;

export function legalContext(env: Env = process.env): LegalContext {
  const controller = env.LEGAL_CONTROLLER_NAME?.trim();
  const dpo = env.LEGAL_DPO_EMAIL?.trim();
  return {
    controller: controller || "a escola responsável por esta plataforma",
    contact: dpo ? `pelo e-mail ${dpo}` : "pela secretaria da escola",
    reviewed: env.LEGAL_REVIEWED === "true",
    version: TERMS_VERSION,
  };
}

export function privacySections(c: LegalContext): LegalSection[] {
  return [
    {
      heading: "Quem somos",
      paragraphs: [
        `A Plataforma TEA é uma ferramenta educacional para crianças com Transtorno do Espectro Autista. ${capitalize(c.controller)} é a responsável pelas decisões sobre os dados tratados aqui (o “controlador”).`,
      ],
    },
    {
      heading: "Quais dados coletamos",
      paragraphs: ["Dos alunos, coletamos o mínimo necessário:"],
      items: [
        "um apelido (não pedimos nome completo);",
        "um código de acesso e um PIN de 4 dígitos (o PIN é guardado apenas de forma criptografada, nunca em texto);",
        "as preferências de tela escolhidas (cores, letras, figuras, movimento e sons);",
        "durante as atividades: quais respostas foram dadas, em quanto tempo, quantas tentativas e que tipo de ajuda foi usada.",
      ],
    },
    {
      heading: "O que NÃO coletamos",
      paragraphs: [
        "Não coletamos nome completo, e-mail, data de nascimento, documentos, endereço, fotos, áudio, vídeo ou localização dos alunos. Não usamos nenhum serviço de estatísticas, publicidade ou rastreamento.",
      ],
    },
    {
      heading: "Dados dos profissionais",
      paragraphs: [
        "Dos professores e terapeutas guardamos o nome de exibição, o e-mail, a senha (criptografada) e um registro de ações importantes (como entrar, exportar ou excluir dados), para garantir a segurança.",
      ],
    },
    {
      heading: "Para que usamos os dados",
      items: [
        "adaptar a tela às necessidades sensoriais de cada criança;",
        "permitir que os profissionais que acompanham a criança vejam sua evolução e escolham atividades adequadas;",
        "manter a plataforma segura.",
      ],
      paragraphs: [
        "Não usamos os dados para publicidade nem para criar perfis comerciais. Os gráficos são um apoio aos profissionais: nenhuma decisão sobre a criança é tomada automaticamente.",
      ],
    },
    {
      heading: "Base legal",
      paragraphs: [
        "O tratamento de dados de crianças é feito com o consentimento específico e em destaque de pelo menos um dos pais ou do responsável legal (LGPD, art. 14, § 1º), sempre no melhor interesse da criança. O consentimento é registrado, com a data e a versão do termo aceito.",
      ],
    },
    {
      heading: "Quem pode ver os dados",
      paragraphs: [
        "Somente os professores e terapeutas vinculados ao aluno. Cada consulta ao relatório de um aluno fica registrada. Não vendemos nem compartilhamos dados com terceiros para outros fins. Usamos prestadores de serviço apenas para hospedar a plataforma e enviar e-mails aos profissionais, sob nossas instruções.",
      ],
    },
    {
      heading: "Cookies",
      paragraphs: [
        "Usamos um único cookie, essencial, que mantém você conectado (sessão). Ele não rastreia você e não é compartilhado com ninguém. As fontes de letra são servidas pelo próprio site.",
      ],
    },
    {
      heading: "Segurança",
      items: [
        "conexão protegida (HTTPS);",
        "senhas e PINs guardados com criptografia de mão única;",
        "cada pessoa só acessa o que seu papel permite (aluno, professor ou terapeuta);",
        "limite de tentativas de acesso e registro de ações sensíveis.",
      ],
    },
    {
      heading: "Por quanto tempo guardamos",
      paragraphs: [
        "Guardamos os dados enquanto a criança usar a plataforma e o consentimento estiver em vigor. Se o consentimento for revogado, o acesso da criança é bloqueado imediatamente e os dados ficam sem uso, até serem excluídos ou até um novo consentimento. A exclusão definitiva é feita a pedido, sem demora. A escola pode definir prazos adicionais de guarda.",
      ],
    },
    {
      heading: "Seus direitos",
      paragraphs: ["O responsável legal pode, a qualquer momento e gratuitamente:"],
      items: [
        "confirmar se tratamos dados da criança e ter acesso a eles;",
        "pedir uma cópia dos dados em formato digital;",
        "pedir correção de dados incorretos;",
        "pedir a exclusão dos dados;",
        "saber com quem os dados são compartilhados;",
        "revogar o consentimento, sem qualquer prejuízo ao atendimento da criança.",
      ],
    },
    {
      heading: "Como exercer seus direitos",
      paragraphs: [
        `Fale com o professor ou terapeuta da criança: eles podem baixar a cópia dos dados, revogar o consentimento e excluir os dados diretamente na plataforma. Você também pode falar com o encarregado pelo tratamento de dados (DPO) ${c.contact}.`,
      ],
    },
    {
      heading: "Mudanças neste texto",
      paragraphs: [
        `Esta é a versão ${c.version}. Se mudarmos algo que afete o tratamento dos dados, avisaremos os responsáveis e pediremos um novo consentimento quando for necessário.`,
      ],
    },
  ];
}

export function termsSections(c: LegalContext): LegalSection[] {
  return [
    {
      heading: "Do que se trata",
      paragraphs: [
        `${capitalize(c.controller)} usa a Plataforma TEA para apoiar a aprendizagem de crianças com TEA em localização, alfabetização e matemática básica. Para isso, precisa tratar alguns dados da criança. Este termo explica quais, para quê e como você pode mudar de ideia.`,
      ],
    },
    {
      heading: "Quais dados da criança serão tratados",
      items: [
        "apelido e código de acesso;",
        "preferências de tela (cores, letras, figuras, movimento e sons);",
        "respostas nas atividades, tempo gasto, número de tentativas e ajuda usada.",
      ],
      paragraphs: ["Não serão coletados nome completo, e-mail, data de nascimento, documentos, fotos, áudio, vídeo ou localização."],
    },
    {
      heading: "Para que serão usados",
      paragraphs: [
        "Para adaptar a plataforma à criança e para que os profissionais que a acompanham vejam a sua evolução e escolham as atividades mais adequadas. Os dados não serão usados para publicidade nem vendidos.",
      ],
    },
    {
      heading: "Quem poderá ver",
      paragraphs: ["Apenas os professores e terapeutas vinculados à criança nesta plataforma."],
    },
    {
      heading: "Por quanto tempo",
      paragraphs: [
        "Enquanto a criança usar a plataforma e este consentimento estiver em vigor, ou até que você peça a exclusão.",
      ],
    },
    {
      heading: "Você pode mudar de ideia",
      paragraphs: [
        `Você pode revogar este consentimento quando quiser, sem prejuízo ao atendimento da criança, avisando o professor ou terapeuta ou o encarregado pelo tratamento de dados ${c.contact}. Ao revogar, o acesso da criança é bloqueado na hora. Você também pode pedir uma cópia dos dados ou a exclusão definitiva.`,
      ],
    },
    {
      heading: "Declaração",
      paragraphs: [
        "Declaro que sou o responsável legal pela criança e que li e entendi este termo. De forma livre e informada, autorizo o tratamento dos dados da criança nas condições acima.",
        `Versão do termo: ${c.version}.`,
      ],
    },
  ];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
