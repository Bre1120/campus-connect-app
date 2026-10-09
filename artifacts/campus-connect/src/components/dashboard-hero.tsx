import type { ReactNode } from 'react';

type DashboardHeroProps = {
  greeting: string;
  firstName: string;
  actions: ReactNode;
};

const studyImage = `${import.meta.env.BASE_URL}images/study-focus.jpg`;

export function DashboardHero({ greeting, firstName, actions }: DashboardHeroProps) {
  return (
    <section className="dashboard-hero" aria-label="Today dashboard introduction">
      <div className="dashboard-hero__copy">
        <p className="dashboard-hero__eyebrow">
          <span className="dashboard-hero__eyebrow-rule" aria-hidden="true" />
          A clear day starts here.
        </p>
        <h1 className="cc-display dashboard-hero__title">
          <span data-testid="text-dashboard-greeting">{greeting}</span>,{' '}
          <span className="dashboard-hero__name" data-testid="text-dashboard-first-name">
            {firstName}
          </span>.
        </h1>
        <p className="dashboard-hero__description">
          One thoughtful next step is enough. Here’s what deserves your attention today.
        </p>
        <div className="dashboard-hero__actions">{actions}</div>
      </div>
      <div className="dashboard-hero__visual" aria-hidden="true">
        <img src={studyImage} alt="" className="dashboard-hero__image" />
        <div className="dashboard-hero__image-wash" />
        <span className="dashboard-hero__caption">Make room to focus</span>
      </div>
    </section>
  );
}
