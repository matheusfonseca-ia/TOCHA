import type { Metadata } from "next";

import {
  LEGAL_UPDATED_AT,
  LegalCallout,
  LegalContact,
  LegalLink,
  LegalList,
  LegalSection,
  LegalSteps,
  Path,
  Term,
} from "@/components/legal/legal-chrome";

export const metadata: Metadata = {
  title: "Exclusão de dados | Falow",
  description:
    "Como pedir a exclusão dos dados tratados pelo Falow: passo a passo para quem interagiu com uma conta que usa o Falow e para quem assina o serviço.",
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
            respondido, nada além disso. Esta página explica como fazer o Falow
            apagar tudo o que guardou sobre você.
          </p>
          <p>
            O caminho depende do seu papel. Escolha o seu:{" "}
            <LegalLink href="#interagiu">
              interagi com uma conta que usa o Falow
            </LegalLink>{" "}
            ou{" "}
            <LegalLink href="#administrador">
              assino o Falow
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
            Instagram e recebeu uma resposta automática: os dados dessa
            interação estão guardados no Falow, na conta de quem administra esse
            perfil.
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
              <Term>Peça a exclusão do que já existe.</Term> Escreva para o
              contato no fim desta página, dizendo o seu @ do Instagram e com
              qual conta você conversou, para que o pedido seja localizado. Você
              também pode avisar a própria conta por DM, mas o e-mail é o canal
              que garante o atendimento.
            </li>
            <li>
              <Term>Pronto.</Term> O Falow apaga os registros e confirma a
              exclusão. Não é preciso criar conta nem preencher formulário.
            </li>
          </LegalSteps>

          <p className="pt-2 font-semibold text-foreground">
            O que é apagado no seu pedido
          </p>
          <LegalList>
            <li>A conversa registrada entre você e a conta conectada.</li>
            <li>
              O texto das mensagens e comentários seus que ficaram guardados nos
              logs de interação, e as mensagens da conversa na área Conversas do
              painel.
            </li>
            <li>
              A foto de perfil, o nome e o número de seguidores do Instagram
              guardados na conversa para a ficha do lead.
            </li>
            <li>
              O seu identificador de remetente e o registro de quais regras já
              dispararam para você.
            </li>
            <li>
              Qualquer sequência em andamento em que você tenha entrado, com o
              ponto onde ela parou.
            </li>
            <li>
              Os dados que você informou nos fluxos, como nome, e-mail e
              telefone, e as etiquetas (tags) atribuídas a você na lista de
              Contatos.
            </li>
            <li>
              As notas internas que o administrador escreveu sobre você.
            </li>
            <li>
              O seu cartão no funil de vendas (CRM) do painel e o histórico das
              etapas por onde ele passou.
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
          title="2. Você assina o Falow"
        >
          <p>
            O Falow é um serviço hospedado em falow.app.br: os dados da sua
            conta ficam no sistema do Falow, e você não tem banco de dados
            próprio para limpar. Você tem três caminhos, do mais leve ao mais
            completo.
          </p>

          <p className="pt-2 font-semibold text-foreground">
            Desconectar a conta do Instagram (para de coletar e responder)
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
              imediatamente. Os registros antigos continuam guardados enquanto
              a assinatura existir.
            </li>
          </LegalSteps>

          <p className="pt-2 font-semibold text-foreground">
            Cancelar a assinatura
          </p>
          <LegalSteps>
            <li>
              No painel, abra <Path>Minha assinatura</Path> e cancele no portal
              da Stripe.
            </li>
            <li>
              Quando a assinatura termina, as automações param na hora e os
              dados ficam guardados por <Term>30 dias</Term>, caso você queira
              reativar.
            </li>
            <li>
              Passados os 30 dias, o Falow apaga tudo de forma definitiva:
              contatos, conversas, tokens de acesso, arquivos e o seu login.
              Você não precisa pedir nada.
            </li>
          </LegalSteps>

          <p className="pt-2 font-semibold text-foreground">
            Apagar tudo antes dos 30 dias
          </p>
          <p>
            Se não quiser esperar o prazo, escreva para o contato no fim desta
            página, pelo mesmo e-mail da assinatura, pedindo a exclusão da conta
            e de todos os dados. Para apagar só os dados de uma pessoa que
            conversou com a sua conta, informe o @ dela no pedido.
          </p>

          <p className="pt-2 font-semibold text-foreground">
            Revogar o acesso no Instagram
          </p>
          <p>
            Em <Path>Configurações e privacidade → Apps e sites</Path> do
            Instagram, remova o aplicativo. Isso encerra o acesso do Falow à
            sua conta, independentemente do que aconteça com a assinatura.
          </p>
        </LegalSection>

        <LegalSection title="3. Prazo">
          <p>
            Pedidos de exclusão são atendidos em até <Term>30 dias</Term>{" "}
            corridos a partir do recebimento (na prática, quase sempre em
            alguns dias). Você recebe uma confirmação pelo mesmo canal em que
            fez o pedido. Depois da exclusão, as cópias de segurança automáticas
            feitas pelo provedor do banco de dados ainda podem conter esses
            dados por um período limitado, em geral alguns dias, até serem
            substituídas na rotina do provedor.
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
