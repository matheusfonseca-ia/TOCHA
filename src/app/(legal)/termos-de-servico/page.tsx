import type { Metadata } from "next";

import {
  LEGAL_UPDATED_AT,
  LegalCallout,
  LegalContact,
  LegalLink,
  LegalList,
  LegalSection,
  Path,
  Term,
} from "@/components/legal/legal-chrome";

export const metadata: Metadata = {
  title: "Termos de Serviço — Falow",
  description:
    "Condições de uso do Falow: o que o serviço faz, o que se espera de quem administra a instalação, o que é proibido e como funciona o encerramento.",
};

// URL cadastrada no campo "Terms of Service URL" do painel da Meta. Assim como
// a política de privacidade, precisa abrir sem login e sem redirecionamento —
// ela aparece na tela de autorização mostrada a quem conecta uma conta.
export default function TermosDeServicoPage() {
  return (
    <article>
      <header className="mb-12">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Termos de Serviço
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: {LEGAL_UPDATED_AT}
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
        <LegalSection title="1. Aceitação destes Termos">
          <p>
            Estes Termos regulam o uso do Falow. Ao criar uma conta no painel,
            conectar uma conta de Instagram ou usar qualquer funcionalidade do
            aplicativo, você declara que leu, entendeu e concorda com tudo o que
            está escrito aqui. Se não concordar com algum ponto, não use o
            serviço.
          </p>
          <p>
            Estes Termos formam um acordo entre você e quem opera esta
            instalação. Eles não substituem os termos da Meta Platforms nem os do
            Instagram, que continuam valendo integralmente sobre a sua conta.
          </p>
        </LegalSection>

        <LegalSection title="2. O que o Falow é">
          <p>
            O Falow é uma ferramenta de automação de mensagens para contas
            profissionais de Instagram. Ele recebe da Meta os avisos de mensagens
            diretas e comentários, compara o texto com as regras de palavra-chave
            e as sequências que <Term>você</Term> cadastrou, e envia as respostas
            que <Term>você</Term> escreveu.
          </p>
          <p>
            É uma ferramenta de execução, não um serviço de consultoria, de
            marketing ou de geração de resultados. Ele faz o que foi configurado,
            na ordem configurada — nada além disso.
          </p>
          <LegalCallout title="Sem vínculo com a Meta">
            <p>
              O Falow é um produto independente. Não é desenvolvido, patrocinado,
              endossado nem administrado pela Meta Platforms, pelo Instagram ou
              pelo Facebook, e não representa nenhuma dessas empresas. Instagram
              e Meta são marcas de seus respectivos titulares, citadas aqui
              apenas para identificar a plataforma com a qual o Falow se integra.
            </p>
          </LegalCallout>
        </LegalSection>

        <LegalSection title="3. Como esta instalação funciona">
          <p>
            Cada instalação do Falow é{" "}
            <Term>independente e hospedada por quem a usa</Term>: quem administra
            mantém o próprio banco de dados, o próprio aplicativo registrado na
            Meta e a própria hospedagem. Não existe servidor central por onde
            passem os dados de outras instalações.
          </p>
          <p>
            Na prática, isso significa que quem opera esta instalação responde
            pelo funcionamento dela, pelo conteúdo das mensagens enviadas e pelo
            tratamento dos dados de quem interage com a conta conectada.
          </p>
        </LegalSection>

        <LegalSection title="4. Quem pode usar">
          <LegalList>
            <li>
              Você precisa ter <Term>18 anos ou mais</Term> e capacidade civil
              para aceitar estes Termos.
            </li>
            <li>
              A conta de Instagram conectada precisa ser{" "}
              <Term>profissional</Term> (Comercial ou Criador) e pertencer a você
              ou a alguém que autorizou você a operá-la.
            </li>
            <li>
              Você precisa estar em dia com os Termos de Uso e as Diretrizes da
              Comunidade do Instagram e da Meta.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="5. Sua conta e suas credenciais">
          <p>
            Você é responsável por manter em sigilo a senha do painel e as chaves
            de ambiente da instalação, e responde por tudo o que acontecer sob a
            sua conta. Avise imediatamente pelo canal de contato se suspeitar de
            acesso indevido.
          </p>
          <p>
            Você também é responsável por manter a autorização da API da Meta
            válida. Se ela for revogada no Instagram, em{" "}
            <Path>Configurações → Apps e sites</Path>, a automação simplesmente
            para de responder.
          </p>
        </LegalSection>

        <LegalSection title="6. Uso aceitável">
          <p>
            Ao usar o Falow, você concorda em <Term>não</Term>:
          </p>
          <LegalList>
            <li>
              Enviar spam, correntes, mensagens em massa não solicitadas ou
              qualquer comunicação que a Meta classifique como comportamento
              inautêntico.
            </li>
            <li>
              Tentar contornar a janela de 24 horas, os limites de frequência ou
              qualquer outra regra técnica imposta pela plataforma.
            </li>
            <li>
              Automatizar conversas com conteúdo ilegal, enganoso, difamatório,
              discriminatório, sexualmente explícito ou que viole direitos de
              terceiros.
            </li>
            <li>
              Se passar por outra pessoa, empresa ou pela própria Meta, ou
              sugerir que as respostas automáticas vêm de um humano quando isso
              induzir o interlocutor a erro relevante.
            </li>
            <li>
              Coletar dados de quem interage com a conta para finalidade
              diferente de responder à conversa, ou revendê-los.
            </li>
            <li>
              Usar o serviço para promover produtos ou práticas proibidas pelas
              políticas de publicidade e comércio da Meta.
            </li>
            <li>
              Fazer engenharia reversa, sobrecarregar a infraestrutura ou
              explorar falhas de segurança sem comunicá-las antes.
            </li>
          </LegalList>
          <p>
            Descumprir qualquer um desses pontos pode levar à suspensão imediata
            do acesso, e é motivo para a própria Meta restringir ou encerrar a
            sua conta de Instagram — o que está fora do controle do Falow.
          </p>
        </LegalSection>

        <LegalSection title="7. O conteúdo é seu">
          <p>
            As regras, sequências, textos e imagens que você cadastra continuam
            sendo seus. O Falow não reivindica propriedade sobre eles e os usa
            apenas para executar a automação que você configurou.
          </p>
          <p>
            Em contrapartida, você é o único responsável por esse conteúdo:
            garante que tem direito de usá-lo e que ele não viola lei, contrato
            ou direito de terceiro. Se um terceiro reclamar do conteúdo enviado
            pela sua automação, a responsabilidade é sua.
          </p>
        </LegalSection>

        <LegalSection title="8. Disponibilidade do serviço">
          <p>
            O Falow depende de serviços que não controla — a API da Meta, a
            hospedagem e o banco de dados. Interrupções, mudanças de política ou
            alterações técnicas nessas plataformas podem afetar ou até
            inviabilizar o funcionamento, sem aviso prévio.
          </p>
          <p>
            Não há garantia de disponibilidade contínua, de tempo de resposta nem
            de entrega de qualquer mensagem específica. Manutenções, correções e
            mudanças de funcionalidade podem acontecer a qualquer momento.
          </p>
        </LegalSection>

        <LegalSection title="9. Garantias e limitação de responsabilidade">
          <p>
            O Falow é fornecido <Term>no estado em que se encontra</Term>, sem
            garantias expressas ou implícitas de adequação a uma finalidade
            específica, de ausência de erros ou de resultado comercial.
          </p>
          <p>
            Na máxima extensão permitida pela lei aplicável, não haverá
            responsabilidade por lucros cessantes, perda de oportunidade, perda
            de dados, dano à reputação ou qualquer dano indireto decorrente do
            uso ou da impossibilidade de uso do serviço — inclusive por mensagens
            enviadas de forma equivocada, mensagens não enviadas, suspensão da
            conta pela Meta ou indisponibilidade das APIs.
          </p>
          <p>
            Nada nesta seção afasta responsabilidades que a lei não permite
            excluir, especialmente as previstas no Código de Defesa do Consumidor
            quando aplicável.
          </p>
        </LegalSection>

        <LegalSection title="10. Encerramento">
          <p>
            Você pode encerrar o uso a qualquer momento: desconecte a conta em{" "}
            <Path>Contas</Path> e, se quiser, apague os dados seguindo o passo a
            passo da página de{" "}
            <LegalLink href="/exclusao-de-dados">exclusão de dados</LegalLink>.
          </p>
          <p>
            O acesso pode ser suspenso ou encerrado em caso de violação destes
            Termos, de exigência legal ou de determinação da Meta. Encerrado o
            uso, as seções sobre conteúdo, garantias, limitação de
            responsabilidade e foro continuam valendo.
          </p>
        </LegalSection>

        <LegalSection title="11. Privacidade">
          <p>
            O tratamento de dados pessoais está descrito na{" "}
            <LegalLink href="/privacidade">Política de Privacidade</LegalLink>,
            que é parte integrante destes Termos. O procedimento de exclusão está
            na página de{" "}
            <LegalLink href="/exclusao-de-dados">exclusão de dados</LegalLink>.
          </p>
        </LegalSection>

        <LegalSection title="12. Alterações nestes Termos">
          <p>
            Estes Termos podem ser atualizados. Quando isso acontecer, a data de
            &ldquo;última atualização&rdquo; no topo da página muda junto, e a
            versão publicada aqui passa a valer a partir dessa data. Continuar
            usando o serviço depois de uma alteração significa concordar com a
            nova versão; se não concordar, encerre o uso conforme a seção 10.
          </p>
        </LegalSection>

        <LegalSection title="13. Lei aplicável e foro">
          <p>
            Estes Termos são regidos pelas leis da República Federativa do
            Brasil. Fica eleito o foro da comarca de São Paulo, Estado de São
            Paulo, para dirimir controvérsias que não puderem ser resolvidas de
            forma amigável, ressalvado o direito do consumidor de acionar o foro
            do seu domicílio.
          </p>
        </LegalSection>

        <LegalSection title="14. Contato">
          <LegalContact reason="dúvidas sobre estes Termos" />
        </LegalSection>
      </div>
    </article>
  );
}
