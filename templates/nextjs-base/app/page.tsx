const features = [
  "Next.js App Router",
  "TypeScript",
  "Tailwind CSS",
  "Responsive layout",
  "Ready for agent edits",
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-[min(1120px,calc(100%-32px))] py-14 max-md:w-[min(100%-20px,1120px)] max-md:py-5">
      <section className="grid gap-5 rounded-[10px] border border-slate-200 bg-white p-14 shadow-[0_18px_44px_rgba(15,23,42,0.08)] max-md:p-7">
        <p className="m-0 text-xs font-extrabold uppercase text-blue-600">Atoms workspace</p>
        <h1 className="m-0 max-w-[760px] text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-normal">
          Next.js starter environment
        </h1>
        <p className="m-0 max-w-[680px] text-[1.08rem] leading-7 text-slate-500">
          This project is preloaded when a new user registers, so the agent can start building from a working foundation.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex min-h-[42px] items-center justify-center rounded-[7px] bg-blue-600 px-4 font-extrabold text-white"
            href="#features"
          >
            View stack
          </a>
          <a
            className="inline-flex min-h-[42px] items-center justify-center rounded-[7px] bg-slate-100 px-4 font-extrabold text-slate-950"
            href="https://nextjs.org/docs"
          >
            Next.js docs
          </a>
        </div>
      </section>

      <section
        id="features"
        className="mt-5 grid grid-cols-5 gap-3.5 max-lg:grid-cols-3 max-md:grid-cols-1"
        aria-label="Starter features"
      >
        {features.map((feature) => (
          <article key={feature} className="min-h-40 rounded-lg border border-slate-200 bg-white p-5">
            <span className="mb-5 block h-1 w-8 rounded-full bg-blue-600" />
            <h2 className="mb-2.5 mt-0 text-base font-bold">{feature}</h2>
            <p className="m-0 text-sm leading-6 text-slate-500">
              Included in the starter so follow-up agent work can focus on product features.
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
