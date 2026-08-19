import type { Metadata } from "next";

import {
  LEGAL_UPDATED_AT,
  LegalCallout,
  LegalCode,
  LegalContact,
  LegalLink,
  LegalList,
  LegalSection,
  LegalSteps,
  Path,
  Term,
} from "@/components/legal/legal-chrome";

export const metadata: Metadata = {
  title: "Exclusão de dados — Falow",
  description:
    "Como pedir e como executar a exclusão dos dados tratados pelo Falow: passo a passo para quem interagiu com a conta e para quem administra a instalação.",
};

// URL cadastrada no campo "User Data Deletion" do painel da Meta, na opção
// "Data deletion instructions URL". Precisa abrir sem login e descrever o
// passo a passo em linguagem clara.
export default function ExclusaoDeDadosPage() {
  return (
    <article>
      <header className="mb-12">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Exclusão de dados
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Última atualização: {LEGAL_UPDATED_AT}
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
        <LegalSection title="O que dá pra apagar por aqui">
          <p>
            O Falow responde automaticamente a DMs e comentários de uma conta de
            Instagram. Para isso, ele guarda o texto das mensagens recebidas, um
            identificador técnico de quem enviou e um registro do que foi
            respondido — nada além disso. Esta página explica como fazer o Falow
            apagar tudo o que guardou sobre você.
          </p>
          <p>
            O caminho depende do seu papel. Escolha o seu:{" "}
            <LegalLink href="#interagiu">
              interagi com uma conta que usa o Falow
            </LegalLink>{" "}
            ou{" "}
            <LegalLink href="#administrador">
              administro esta instalação
            </LegalLink>
            .
          </p>
        </LegalSection>

        <LegalSection
          id="interagiu"
          title="1. Você mandou DM ou comentou numa conta que usa o Falow"
        >
          <p>
            É o caso da maioria das pessoas. Você conversou com uma conta de
            Instagram e recebeu uma resposta automática — os dados dessa
            interação estão no banco de quem administra a conta.
          </p>

          <p className="pt-2 font-semibold text-foreground">
            Passo a passo
          </p>
          <LegalSteps>
            <li>
              <Term>Corte o acesso futuro.</Term> No Instagram, vá em{" "}
              <Path>Configurações e privacidade → Apps e sites</Path>, encontre o
              aplicativo na lista e toque em <Path>Remover</Path>. A partir daí
              nenhum dado novo seu chega ao Falow.
            </li>
            <li>
              <Term>Peça a exclusão do que já existe.</Term> Envie uma mensagem
              direta para a mesma conta de Instagram com a qual você conversou,
              pedindo a exclusão dos seus dados. Se preferir, use o contato no
              fim desta página. Diga o seu @ do Instagram para que o pedido seja
              localizado.
            </li>
            <li>
              <Term>Pronto.</Term> O administrador apaga os registros e confirma
              a exclusão. Não é preciso criar conta nem preencher formulário.
            </li>
          </LegalSteps>

          <p className="pt-2 font-semibold text-foreground">
            O que é apagado no seu pedido
          </p>
          <LegalList>
            <li>A conversa registrada entre você e a conta conectada.</li>
            <li>
              O texto das mensagens e comentários seus que ficaram guardados nos
              logs de interação.
            </li>
            <li>
              O seu identificador de remetente e o registro de quais regras já
              dispararam para você.
            </li>
            <li>
              Qualquer sequência em andamento em que você tenha entrado, com o
              ponto onde ela parou.
            </li>
          </LegalList>

          <LegalCallout title="O que esta página não consegue apagar">
            <p>
              As mensagens dentro do <Term>seu próprio Instagram</Term> e nos
              servidores da Meta não pertencem ao Falow e continuam existindo. Pra
              apagá-las, use o próprio Instagram (apague a conversa) ou fale com a
              Meta. O mesmo vale pra comentários públicos: quem apaga é o autor
              ou o dono da publicação.
            </p>
          </LegalCallout>
        </LegalSection>

        <LegalSection
          id="administrador"
          title="2. Você administra esta instalação do Falow"
        >
          <p>
            Cada instalação do Falow é hospedada por quem a usa: seu banco na
            Supabase, seu aplicativo na Meta, sua hospedagem. Isso quer dizer que
            você tem controle direto sobre todos os dados e pode apagá-los sem
            depender de ninguém.
          </p>

          <p className="pt-2 font-semibold text-foreground">
            Desconectar a conta (para de coletar e responder)
          </p>
          <LegalSteps>
            <li>
              No painel, abra <Path>Contas</Path>.
            </li>
            <li>
              Na conta desejada, clique em <Path>Desconectar</Path> e confirme.
            </li>
            <li>
              O token de acesso deixa de ser usado e a automação para de responder
              imediatamente. Os registros antigos continuam no banco até você
              apagá-los no passo seguinte.
            </li>
          </LegalSteps>

          <p className="pt-2 font-semibold text-foreground">
            Apagar todos os dados de uma conta
          </p>
          <p>
            No SQL Editor do seu projeto Supabase, apagar a linha da conta em{" "}
            <Term>ig_accounts</Term> remove em cascata tudo que depende dela —
            regras, conversas, gatilhos, sequências, execuções e logs:
          </p>
          <LegalCode>{`-- troque pelo @ da conta que você quer apagar
delete from public.ig_accounts where ig_username = 'seu_usuario';`}</LegalCode>
          <p>
            Para apagar apenas os dados de <Term>uma pessoa</Term> — atendendo a
            um pedido individual — use o identificador de remetente dela:
          </p>
          <LegalCode>{`-- o ig_sender_id aparece na tela de Logs do painel
delete from public.interactions   where ig_sender_id = 'ID_DO_REMETENTE';
delete from public.conversations  where ig_sender_id = 'ID_DO_REMETENTE';
delete from public.rule_triggers  where ig_sender_id = 'ID_DO_REMETENTE';
delete from public.sequence_runs  where ig_sender_id = 'ID_DO_REMETENTE';`}</LegalCode>

          <p className="pt-2 font-semibold text-foreground">
            Apagar a instalação inteira
          </p>
          <LegalSteps>
            <li>
              Remova seu usuário em <Path>Supabase → Authentication → Users</Path>{" "}
              — isso apaga em cascata todas as contas conectadas e seus dados.
            </li>
            <li>
              Exclua o projeto na Supabase e o deploy na Vercel, se não for mais
              usar nenhum dos dois.
            </li>
            <li>
              Exclua o aplicativo em{" "}
              <LegalLink external href="https://developers.facebook.com/apps">
                developers.facebook.com/apps
              </LegalLink>
              , o que revoga todos os tokens emitidos por ele.
            </li>
          </LegalSteps>
        </LegalSection>

        <LegalSection title="3. Prazo">
          <p>
            Pedidos de exclusão são atendidos em até <Term>30 dias</Term>{" "}
            corridos a partir do recebimento — na prática, quase sempre em alguns
            dias. Você recebe uma confirmação pelo mesmo canal em que fez o
            pedido. Nenhuma cópia de backup é mantida depois desse prazo.
          </p>
        </LegalSection>

        <LegalSection title="4. Contato">
          <LegalContact />
          <p>
            Para entender quais dados são coletados e por quê, veja a{" "}
            <LegalLink href="/privacidade">Política de Privacidade</LegalLink>.
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
