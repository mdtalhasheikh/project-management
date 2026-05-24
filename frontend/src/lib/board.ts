export type Card = {
  id: string;
  title: string;
  details: string;
};

export type BoardColumn = {
  id: string;
  name: string;
  cards: Card[];
};

export const initialBoard: BoardColumn[] = [
  {
    id: "backlog",
    name: "Backlog",
    cards: [
      {
        id: "card-positioning",
        title: "Finalize positioning",
        details: "Condense launch message into a single promise for the homepage and sales deck.",
      },
      {
        id: "card-segments",
        title: "Prioritize audience segments",
        details: "Rank the first three customer profiles for the launch sprint.",
      },
    ],
  },
  {
    id: "ready",
    name: "Ready",
    cards: [
      {
        id: "card-brief",
        title: "Creative brief",
        details: "Prepare the design brief for social launch assets and email headers.",
      },
    ],
  },
  {
    id: "progress",
    name: "In Progress",
    cards: [
      {
        id: "card-web",
        title: "Landing page QA",
        details: "Review responsive states, form validation, and analytics events before release.",
      },
      {
        id: "card-demo",
        title: "Sales demo script",
        details: "Tighten the five-minute demo narrative around the core workflow.",
      },
    ],
  },
  {
    id: "review",
    name: "Review",
    cards: [
      {
        id: "card-pricing",
        title: "Pricing page copy",
        details: "Legal and product are checking plan names, feature limits, and disclaimers.",
      },
    ],
  },
  {
    id: "done",
    name: "Done",
    cards: [
      {
        id: "card-checklist",
        title: "Launch checklist",
        details: "Confirm owners for support, incident response, and launch-day communications.",
      },
    ],
  },
];
