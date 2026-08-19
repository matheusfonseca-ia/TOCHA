import type { Metadata } from "next";

import {
  LEGAL_CONTACT_EMAIL,
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
  title: "Política de Privacidade — Falow",
  description:
    "Como o Falow coleta, usa, armazena e exclui os dados necessários para responder automaticamente DMs e comentários no Instagram.",
};

// URL cadastrada no campo "Privacy Policy URL" do painel da Meta. Precisa
// abrir sem login e sem redirecionamento.
export default function PrivacidadePage() {
  return (
    <article>
      <header className="mb-12">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Política de Privacidade
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: {LEGAL_UPDATED_AT}
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
        <LegalSection title="1. O que é o Falow e quem responde por ele">
          <p>
            O Falow é uma ferramenta de automação de mensagens para o Instagram.
            Ele responde automaticamente a mensagens diretas (DMs) e a
            comentários com base em regras de palavra-chave e em sequências de
            mensagens definidas por quem administra a conta — do tipo &ldquo;se a
            mensagem contiver X, responda Y&rdquo;.
          </p>
          <p>
            Cada instalação do Falow é <Term>independente</Term>: quem administra
            a conta de Instagram hospeda o próprio aplicativo, com o próprio
            banco de dados e o próprio aplicativo na Meta. Não existe servidor
            central do Falow que receba ou concentre dados de outras instalações.
            Por isso, o responsável pelo tratamento dos dados descritos aqui (o
            controlador, na linguagem da LGPD) é o administrador da conta de
            Instagram atendida por esta automação.
          </p>
          <LegalCallout title="Controlador desta instalação">
            <p>
              <Term>PATRICIA POLETINI FONSECA</Term>, inscrita no CNPJ sob o nº
              15.030.598/0001-39, estabelecida em Itatiba, Estado de São Paulo,
              Brasil. É ela quem determina as finalidades e os meios do
              tratamento descrito nesta política, e quem responde pelos pedidos
              de acesso, correção e exclusão.
            </p>
            <p>
              Contato:{" "}
              <LegalLink href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
                {LEGAL_CONTACT_EMAIL}
              </LegalLink>
              .
            </p>
          </LegalCallout>
        </LegalSection>

        <LegalSection title="2. Quais dados são coletados">
          <p>
            O Falow coleta apenas o necessário para decidir se uma mensagem
            merece resposta e para registrar o que foi respondido:
          </p>
          <LegalList>
            <li>
              <Term>Dados da conta conectada:</Term> identificador e nome de
              usuário da conta profissional de Instagram, foto de perfil e — em
              conexões antigas feitas via Facebook — nome e identificador da
              Página vinculada. Tudo obtido pela API oficial da Meta, mediante
              autorização explícita do administrador.
            </li>
            <li>
              <Term>Tokens de acesso:</Term> credenciais emitidas pela Meta para
              ler e enviar mensagens em nome da conta conectada. São armazenadas
              criptografadas (AES-256-GCM), renovadas automaticamente antes de
              expirar, e nunca são exibidas na tela nem compartilhadas.
            </li>
            <li>
              <Term>Mensagens diretas recebidas:</Term> o texto das DMs enviadas
              para a conta conectada e o identificador técnico do remetente
              atribuído pela Meta — um código específico deste aplicativo, que
              não revela sua identidade fora dele. O nome de usuário é guardado
              quando a própria Meta o envia junto do evento.
            </li>
            <li>
              <Term>Comentários públicos:</Term> o texto do comentário, os
              identificadores do comentário e da publicação e o identificador de
              quem comentou — usados para responder o comentário e, quando a
              regra prevê, iniciar uma conversa na DM.
            </li>
            <li>
              <Term>Estado das sequências:</Term> em que ponto de um fluxo cada
              pessoa parou, quando ele deve ser retomado e qual opção foi
              escolhida em botões e respostas rápidas.
            </li>
            <li>
              <Term>Registro de interações (logs):</Term> data e hora, texto da
              mensagem recebida, regra e palavra-chave que dispararam, tipo de
              resposta enviada, tempo de processamento e eventuais erros. É o que
              alimenta as métricas e a tela de logs do painel.
            </li>
            <li>
              <Term>Dados de acesso do administrador:</Term> e-mail e senha
              (armazenada apenas como hash, nunca em texto puro) usados para
              entrar no painel.
            </li>
          </LegalList>
          <p>
            O Falow <Term>não</Term> acessa sua lista de seguidores, seu feed,
            suas mensagens antigas, seus contatos, sua localização, seus dados de
            pagamento nem qualquer conversa que não tenha sido enviada para a
            conta conectada depois da instalação.
          </p>
        </LegalSection>

        <LegalSection title="3. Permissões pedidas à Meta e por quê">
          <LegalList>
            <li>
              <Term>instagram_business_basic</Term> — identificar a conta
              profissional que está sendo conectada (nome de usuário, id e foto)
              e manter o token válido.
            </li>
            <li>
              <Term>instagram_business_manage_messages</Term> — receber as DMs
              enviadas à conta e responder a elas com o texto configurado nas
              regras e sequências.
            </li>
            <li>
              <Term>instagram_business_manage_comments</Term> — ler os
              comentários das publicações da conta e responder publicamente ou
              por DM, conforme a regra.
            </li>
          </LegalList>
          <p>
            Nenhuma permissão é usada para finalidade diferente da descrita
            acima. Se uma permissão for revogada, a automação correspondente
            simplesmente para de funcionar.
          </p>
        </LegalSection>

        <LegalSection title="4. Como os dados são usados">
          <p>
            Os dados são usados unicamente para operar a automação: receber da
            Meta a notificação de mensagem ou comentário, conferir se o texto
            corresponde a alguma regra cadastrada, enviar a resposta automática
            (com um atraso de alguns segundos, para a conversa parecer natural),
            avançar as sequências em andamento e registrar a interação para
            consulta do administrador no painel.
          </p>
          <p>
            Não há decisão automatizada com efeito jurídico sobre você: o
            resultado é sempre o envio, ou não, de uma mensagem de resposta.
          </p>
        </LegalSection>

        <LegalSection title="5. O que o Falow não faz">
          <LegalList>
            <li>Não vende, aluga nem cede seus dados a terceiros.</li>
            <li>
              Não usa seus dados para publicidade, segmentação de anúncios ou
              enriquecimento de bases de contatos.
            </li>
            <li>
              Não usa suas mensagens para treinar modelos de inteligência
              artificial.
            </li>
            <li>
              Não envia mensagens para quem não iniciou o contato, e não envia
              nada fora da janela de 24 horas permitida pela Meta — passado esse
              prazo sem uma nova mensagem sua, a automação para.
            </li>
            <li>
              Não instala rastreadores, pixels de publicidade ou ferramentas de
              analytics de terceiros nesta aplicação.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="6. Onde os dados ficam e como são protegidos">
          <p>
            Os dados ficam em um banco Postgres gerenciado pela{" "}
            <LegalLink external href="https://supabase.com">
              Supabase
            </LegalLink>
            , com regras de acesso por linha (RLS) que impedem um administrador
            de enxergar dados de outro. A aplicação é hospedada pela{" "}
            <LegalLink external href="https://vercel.com">
              Vercel
            </LegalLink>
            . A comunicação com o Instagram acontece exclusivamente pelas APIs
            oficiais da{" "}
            <LegalLink external href="https://www.meta.com">
              Meta Platforms
            </LegalLink>
            , sujeitas às políticas de dados da própria Meta.
          </p>
          <LegalList>
            <li>Todo o tráfego é criptografado em trânsito (HTTPS/TLS).</li>
            <li>
              Os tokens de acesso são criptografados também em repouso, com
              AES-256-GCM e chave que fica só no ambiente do servidor.
            </li>
            <li>
              Os eventos recebidos da Meta são validados por assinatura HMAC (
              <Term>X-Hub-Signature-256</Term>), de modo que ninguém consiga
              injetar eventos falsos.
            </li>
            <li>
              O painel exige login, e o cadastro se tranca automaticamente depois
              da criação da primeira conta.
            </li>
          </LegalList>
          <p>
            Nenhum sistema é infalível. Em caso de incidente de segurança que
            possa gerar risco relevante a você, o administrador comunicará os
            titulares afetados e a autoridade competente nos prazos aplicáveis.
          </p>
        </LegalSection>

        <LegalSection title="7. Por quanto tempo os dados ficam guardados">
          <LegalList>
            <li>
              <Term>Tokens de acesso:</Term> enquanto a conta estiver conectada.
              São invalidados e apagados assim que a conta é desconectada ou a
              autorização é revogada.
            </li>
            <li>
              <Term>Mensagens, comentários e logs:</Term> ficam guardados
              enquanto forem úteis ao histórico e às métricas do administrador, e
              são apagados a qualquer momento a pedido do titular.
            </li>
            <li>
              <Term>Estado das sequências:</Term> é apagado junto com os demais
              registros da pessoa.
            </li>
          </LegalList>
          <p>
            Apagar a conta conectada no painel remove em cascata todas as
            conversas, regras, sequências, execuções e logs vinculados a ela.
          </p>
        </LegalSection>

        <LegalSection title="8. Cookies">
          <p>
            Esta aplicação usa apenas os cookies de sessão do Supabase Auth,
            estritamente necessários para manter o administrador conectado ao
            painel. As páginas públicas — esta e a de exclusão de dados — não
            gravam cookies e não têm rastreamento de terceiros.
          </p>
        </LegalSection>

        <LegalSection id="seus-direitos" title="9. Seus direitos">
          <p>
            Nos termos da LGPD (Lei 13.709/2018) e, quando aplicável, do GDPR,
            você pode a qualquer momento pedir: confirmação de que existe
            tratamento, acesso aos seus dados, correção de dados incompletos ou
            desatualizados, anonimização ou <Term>exclusão</Term>, informação
            sobre compartilhamentos, e revogação do consentimento.
          </p>
          <LegalCallout title="Quer apagar seus dados?">
            <p>
              A página de{" "}
              <LegalLink href="/exclusao-de-dados">exclusão de dados</LegalLink>{" "}
              traz o passo a passo completo, tanto para quem interagiu com a
              conta quanto para quem administra a instalação.
            </p>
          </LegalCallout>
          <p>
            Você também pode revogar o acesso do aplicativo direto pelo
            Instagram, em <Path>Configurações → Apps e sites</Path>, o que impede
            qualquer acesso futuro aos seus dados.
          </p>
        </LegalSection>

        <LegalSection title="10. Menores de idade">
          <p>
            O Falow acompanha a política do próprio Instagram e não se destina a
            menores de 13 anos. Se for constatado que dados de uma criança foram
            coletados sem o consentimento devido, eles serão apagados.
          </p>
        </LegalSection>

        <LegalSection title="11. Mudanças nesta política">
          <p>
            Se esta política mudar, a data de &ldquo;última atualização&rdquo; no
            topo da página muda junto, e a versão publicada aqui passa a valer a
            partir dessa data. Mudanças relevantes no uso dos dados serão
            comunicadas pelo canal de contato abaixo.
          </p>
        </LegalSection>

        <LegalSection title="12. Contato">
          <LegalContact />
        </LegalSection>
      </div>
    </article>
  );
}
