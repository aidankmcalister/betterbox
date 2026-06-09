import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { linkGoogle, signIn, signOut, useSession } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  component: Home,
});

type Email = { id: string; from: string; subject: string; date: string };
type Account = { accountId: string; email: string };

function Inbox({ account }: { account: Account }) {
  const [emails, setEmails] = useState<Email[] | null>(null);

  useEffect(() => {
    fetch(`/api/emails?accountId=${account.accountId}&max=50`)
      .then((res) => res.json())
      .then((data) => setEmails(data.emails ?? []));
  }, [account.accountId]);

  return (
    <section>
      <h2>{account.email || account.accountId}</h2>
      {!emails ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {emails.map((email) => (
            <li key={email.id}>
              <strong>{email.subject || "(no subject)"}</strong> — {email.from}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Inboxes() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []));
  }, []);

  if (!accounts) return <p>Loading accounts…</p>;

  return (
    <>
      {accounts.map((account) => (
        <Inbox key={account.accountId} account={account} />
      ))}
    </>
  );
}

function Home() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <main>Loading...</main>;
  }

  if (!session) {
    return (
      <main>
        <button onClick={() => signIn()}>Sign in with Google</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Signed in as {session.user.email}</h1>
      <button onClick={() => linkGoogle()}>Link another Gmail</button>
      <button onClick={() => signOut()}>Sign out</button>
      <Inboxes />
    </main>
  );
}
