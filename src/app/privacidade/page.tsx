import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — Falow",
  description:
    "Como o Falow coleta, usa, armazena e exclui os dados necessários para a automação de respostas no Instagram.",
};

// Página pública exigida pelo painel da Meta (Privacy Policy URL e
// Data deletion instructions URL apontam para cá).
export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#7C3AED] text-base text-white shadow-[0_0_14px_rgba(139,92,246,0.55)]">
            ⚡
          </div>
          <span className="font-display text-lg font-bold">Falow</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Política de Privacidade
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: 3 de julho de 2026
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            1. O que é o Falow
          </h2>
          <p>
            O Falow é uma ferramenta de automação de mensagens diretas
            (DMs) do Instagram, instalada e operada pelo próprio dono da conta
            de Instagram conectada. Ele responde automaticamente a mensagens
            recebidas com base em regras de palavra-chave definidas pelo
            administrador — do tipo &ldquo;se a mensagem contiver X, responda
            Y&rdquo;.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            2. Quais dados são coletados
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Dados da conta conectada:</strong>{" "}
              identificador e nome de usuário da conta profissional de
              Instagram, nome e identificador da Página do Facebook vinculada e
              foto de perfil, obtidos via API oficial da Meta mediante
              autorização do administrador.
            </li>
            <li>
              <strong className="text-foreground">Tokens de acesso:</strong>{" "}
              credenciais emitidas pela Meta para enviar respostas em nome da
              conta conectada. São armazenadas criptografadas (AES-256-GCM) e
              nunca são exibidas nem compartilhadas.
            </li>
            <li>
              <strong className="text-foreground">Mensagens recebidas:</strong>{" "}
              o texto das DMs recebidas pela conta conectada e o identificador
              técnico do remetente atribuído pela Meta. Esses dados são usados
              exclusivamente para verificar se a mensagem corresponde a alguma
              regra de resposta e para manter um registro (log) das interações.
            </li>
            <li>
              <strong className="text-foreground">Dados de login do administrador:</strong>{" "}
              e-mail e senha (criptografada) usados para acessar o painel de
              administração.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            3. Como os dados são usados
          </h2>
          <p>
            Os dados são usados unicamente para operar a automação: receber a
            notificação de mensagem enviada pela Meta, comparar o texto com as
            regras cadastradas, enviar a resposta automática e registrar a
            interação para consulta do administrador. Os dados{" "}
            <strong className="text-foreground">
              não são vendidos, alugados nem compartilhados
            </strong>{" "}
            com terceiros para qualquer finalidade comercial ou de publicidade.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            4. Onde os dados ficam armazenados
          </h2>
          <p>
            Os dados são armazenados em banco de dados gerenciado pela{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://supabase.com"
              rel="noreferrer noopener"
              target="_blank"
            >
              Supabase
            </a>{" "}
            e a aplicação é hospedada pela{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://vercel.com"
              rel="noreferrer noopener"
              target="_blank"
            >
              Vercel
            </a>
            . A comunicação com o Instagram acontece exclusivamente pelas APIs
            oficiais da{" "}
            <a
              className="text-primary underline-offset-4 hover:underline"
              href="https://www.meta.com"
              rel="noreferrer noopener"
              target="_blank"
            >
              Meta Platforms
            </a>
            , sob as políticas de dados da própria Meta. Todo o tráfego é
            criptografado (HTTPS) e os tokens de acesso são criptografados
            também em repouso.
          </p>
        </section>

        <section id="exclusao-de-dados">
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            5. Exclusão de dados
          </h2>
          <p className="mb-3">
            Você pode solicitar a exclusão dos seus dados a qualquer momento:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">
                Se você enviou uma DM para a conta conectada:
              </strong>{" "}
              envie uma mensagem direta para a mesma conta de Instagram pedindo
              a exclusão dos seus registros. O administrador removerá as
              mensagens e identificadores associados a você.
            </li>
            <li>
              <strong className="text-foreground">Se você é o administrador:</strong>{" "}
              desconecte a conta no painel (menu Contas) para revogar e apagar
              os tokens de acesso. Os registros de interações podem ser
              apagados diretamente no banco de dados da instalação.
            </li>
            <li>
              Você também pode revogar o acesso do aplicativo pelo próprio
              Instagram/Facebook em{" "}
              <span className="text-foreground">
                Configurações → Site e apps
              </span>
              , o que impede qualquer acesso futuro aos seus dados.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
            6. Contato
          </h2>
          <p>
            Esta instalação do Falow é operada de forma independente pelo
            responsável pela conta de Instagram conectada. Para dúvidas sobre
            esta política ou sobre seus dados, entre em contato por mensagem
            direta com a própria conta de Instagram atendida por esta
            automação.
          </p>
        </section>
      </div>

      <footer className="mt-16 border-t border-border pt-6">
        <p className="text-xs text-muted-foreground">
          Falow — automação de respostas para DMs do Instagram.
        </p>
      </footer>
    </main>
  );
}
