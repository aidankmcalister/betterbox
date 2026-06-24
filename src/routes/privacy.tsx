import { createFileRoute, Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · BetterBox" },
      {
        name: "description",
        content:
          "How BetterBox handles your Google account data, including Gmail access under the Google API Services User Data Policy.",
      },
    ],
  }),
  component: Privacy,
});

/** Last updated — bump this whenever the policy text changes. */
const LAST_UPDATED = "June 24, 2026";
const CONTACT_EMAIL = "aidankmcalister@gmail.com";

function Privacy() {
  return (
    <main className="min-h-svh w-full bg-canvas text-ink">
      <div className="mx-auto max-w-180 px-6 pt-16 pb-24">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-ink-subtle transition-colors hover:text-ink"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
            <MailIcon className="size-5" />
          </span>
          <span className="font-mono text-[13px] font-semibold">BetterBox</span>
        </Link>

        <h1 className="mt-10 text-[32px] leading-[1.1] font-semibold tracking-[-1px]">
          Privacy Policy
        </h1>
        <p className="mt-2 font-mono text-[11.5px] text-ink-tertiary">
          Last updated: {LAST_UPDATED}
        </p>

        <p className="mt-6 text-[15px] leading-[1.7] text-ink-muted">
          BetterBox is a faster, denser web client for your Google inboxes,
          built on the Gmail API, that can also bring your GitHub pull requests
          and issues alongside your mail. It is operated by Aidan McAlister as an
          individual developer (&ldquo;BetterBox,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;). This policy explains what data we access, why, how
          long we keep it, and the choices you have. BetterBox is not affiliated
          with or endorsed by Google.
        </p>

        <Callout>
          BetterBox is in active development and has not yet completed
          Google&rsquo;s verification, so when you sign in Google shows an
          &ldquo;unverified app&rdquo; warning. This is expected: to continue,
          click <strong>Advanced</strong>, then{" "}
          <strong>Proceed to BetterBox</strong>. It is a client for Gmail, not a
          new email service. Your email continues to live in your Google
          account.
        </Callout>

        <Section title="1. Information we access and collect">
          <p>
            We keep what we collect to the minimum needed to run the client.
          </p>
          <Subhead>From your Google account (with your consent)</Subhead>
          <List>
            <li>
              <strong>Basic profile:</strong> your name, email address, profile
              picture, and Google account identifier, used to show who is signed
              in and to label your inboxes.
            </li>
            <li>
              <strong>OAuth tokens:</strong> the access and refresh tokens
              Google issues so the app can stay signed in and call the Gmail API
              on your behalf. These are encrypted at rest in our database.
            </li>
          </List>
          <Subhead>Gmail data, accessed through the Gmail API</Subhead>
          <p>
            With the <Mono>gmail.modify</Mono> scope you grant, BetterBox can
            read your messages and their metadata, send messages on your behalf,
            and change message state (such as marking as read or adjusting
            labels). This data is fetched on demand to display and act on your
            mail inside the app.
          </p>
          <p>
            <strong>
              We do not store the contents of your emails on our servers.
            </strong>{" "}
            Message headers and bodies are retrieved from Google when you open
            or act on them and are held only transiently in your browser to
            render the interface. We do not maintain a server-side copy or
            archive of your mailbox.
          </p>
          <Subhead>From GitHub (optional, if you connect it)</Subhead>
          <p>
            BetterBox can show your GitHub pull requests, review requests, and
            issues (those assigned to or opened by you) alongside your inbox. If
            you connect a GitHub account, we store the OAuth tokens GitHub
            provides (encrypted at rest, the same as Google) and use them to
            make read-only calls to the GitHub API on your behalf. We do not
            write to your repositories, and your GitHub data is fetched on
            demand rather than stored on our servers. Connecting GitHub is
            optional; you can use BetterBox with Gmail alone.
          </p>
          <Subhead>Automatically, to operate the service</Subhead>
          <List>
            <li>
              <strong>Session &amp; technical data:</strong> a session token,
              your IP address, browser user-agent, and timestamps, used to keep
              you signed in and to protect the account against abuse.
            </li>
          </List>
          <p>
            We do <strong>not</strong> use third-party advertising, analytics,
            or tracking SDKs, and we do not place non-essential cookies.
          </p>
          <p>
            Your app preferences (theme, layout, density, and similar settings)
            are stored locally in your browser and are never sent to or stored
            on our servers.
          </p>
        </Section>

        <Section title="2. How we use your information">
          <List>
            <li>To authenticate you and keep your session active.</li>
            <li>
              To display, search, compose, send, and organize your mail through
              the Gmail API.
            </li>
            <li>
              To operate, maintain, debug, and secure the service, including
              preventing unauthorized access.
            </li>
            <li>To comply with legal obligations where applicable.</li>
          </List>
          <p>
            We do not use your data for advertising, profiling, or building a
            marketing profile, and we never sell it.
          </p>
        </Section>

        <Section title="3. Google API Services: Limited Use">
          <p>
            BetterBox&rsquo;s use and transfer of information received from
            Google APIs adheres to the{" "}
            <Anchor href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </Anchor>
            , including the Limited Use requirements. Specifically:
          </p>
          <List>
            <li>
              We only use access to Google user data to provide and improve the
              user-facing features of BetterBox.
            </li>
            <li>
              We do not transfer Google user data to others except as necessary
              to provide or improve those features, to comply with applicable
              law, or as part of a merger or acquisition.
            </li>
            <li>We do not use Google user data for serving advertisements.</li>
            <li>
              We do not allow humans to read your Gmail data unless we have your
              affirmative consent for specific messages, it is necessary for
              security or to comply with applicable law, or the data has been
              aggregated and anonymized.
            </li>
          </List>
        </Section>

        <Section title="4. How your information is shared">
          <p>
            We do not sell your personal information. We share data only with:
          </p>
          <List>
            <li>
              <strong>Google</strong>, to authenticate you and access the Gmail
              API at your direction.
            </li>
            <li>
              <strong>GitHub</strong>, if you connect it, to access the GitHub
              API at your direction and show your pull requests and issues.
            </li>
            <li>
              <strong>Stripe</strong> (coming soon), our payment processor for
              hosted-plan billing once it launches. Stripe will collect and
              process your payment details directly under its own privacy
              policy; BetterBox does not receive or store your full card
              information.
            </li>
            <li>
              <strong>Infrastructure providers</strong> that host the
              application and database under our instruction (acting as data
              processors), solely to operate the service.
            </li>
            <li>
              <strong>Legal authorities</strong>, where required by valid legal
              process or to protect rights, safety, and security.
            </li>
          </List>
        </Section>

        <Section title="5. Data retention">
          <List>
            <li>
              <strong>Profile and OAuth tokens:</strong> kept while your account
              is connected. When you disconnect or request deletion, they are
              removed from our database.
            </li>
            <li>
              <strong>Session &amp; technical data:</strong> retained for the
              life of the session and a short period afterward for security,
              then deleted.
            </li>
            <li>
              <strong>Email contents:</strong> not retained, fetched on demand
              and not persisted on our servers.
            </li>
          </List>
        </Section>

        <Section title="6. Your choices and rights">
          <List>
            <li>
              <strong>Revoke access at any time</strong> from your Google
              Account under{" "}
              <Anchor href="https://myaccount.google.com/permissions">
                Security → Third-party access
              </Anchor>
              . Revoking immediately stops BetterBox from accessing your Gmail.
            </li>
            <li>
              <strong>Access or delete your data:</strong> email us and we will
              delete your stored profile, tokens, and session records.
            </li>
          </List>
          <p>
            Depending on where you live, you may have additional rights. If you
            are a <strong>California resident</strong> (CCPA/CPRA), you have the
            right to know what personal information we collect, to request
            deletion, and not to be discriminated against for exercising those
            rights, and we confirm we do not sell or share your personal
            information. If you are in the <strong>EEA or UK</strong> (GDPR),
            you have rights to access, correct, delete, restrict, and port your
            data, and to object to processing; our legal bases are your consent
            and the performance of our service to you. To exercise any of these,
            contact us below.
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            Data is transmitted over encrypted connections (TLS), and OAuth
            tokens are stored in an access-controlled database. We restrict
            access to the systems that hold your data. No method of transmission
            or storage is completely secure, so we cannot guarantee absolute
            security, but we work to protect your information and to respond
            promptly to any incident.
          </p>
        </Section>

        <Section title="8. Children's privacy">
          <p>
            BetterBox is not directed to children under 13 (or the minimum age
            of digital consent in your country), and we do not knowingly collect
            their data. If you believe a child has provided us information,
            contact us and we will delete it.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>
            We may update this policy as the product evolves. Material changes
            will be reflected by updating the &ldquo;Last updated&rdquo; date
            above, and where appropriate we will provide additional notice.
            Continued use after an update means you accept the revised policy.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            For any privacy question or request, email{" "}
            <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>.
            We will respond as promptly as we reasonably can.
          </p>
        </Section>

        <p className="mt-12 border-t pt-6 font-mono text-[11px] text-ink-tertiary">
          Operated by Aidan McAlister · {CONTACT_EMAIL}
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-ink-muted">
        {children}
      </div>
    </section>
  );
}

function Subhead({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-1 text-[13px] font-semibold text-ink-subtle">
      {children}
    </h3>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-ink-tertiary">
      {children}
    </ul>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-[10px] border border-hairline-strong bg-surface-2 px-4 py-3 text-[13.5px] leading-[1.6] text-ink-subtle">
      {children}
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12.5px] text-label-blue">
      {children}
    </code>
  );
}

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}
