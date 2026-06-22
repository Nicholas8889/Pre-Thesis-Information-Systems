"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getCardHelpMetadata } from "@/lib/card-help";

export function CardHelpEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname.endsWith("/print")) return;

    const enhanceCards = () => {
      document
        .querySelectorAll<HTMLElement>("main .shadow-soft:not(.print-page)")
        .forEach((card) => enhanceCard(card, pathname));
    };

    enhanceCards();
    const observer = new MutationObserver(enhanceCards);
    observer.observe(document.querySelector("main") ?? document.body, {
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}

function enhanceCard(card: HTMLElement, pathname: string) {
  if (card.dataset.cardHelpEnhanced === "true") return;
  card.dataset.cardHelpEnhanced = "true";

  const heading = findCardHeading(card);
  const metadata = getCardHelpMetadata({
    pathname,
    existingTitle: heading?.textContent ?? undefined,
    hasTable: Boolean(card.querySelector("table")),
    hasForm: Boolean(card.querySelector("form"))
  });
  const help = createInfoTooltip(metadata.description);

  if (heading) {
    heading.classList.add("card-title-with-help");
    heading.append(help);
    return;
  }

  const header = document.createElement("div");
  header.className = "card-generated-header no-print";
  const title = document.createElement("h2");
  title.className = "card-title-with-help text-lg font-semibold text-ink";
  title.textContent = metadata.title;
  title.append(help);
  header.append(title);
  card.insertBefore(header, card.firstChild);
}

function findCardHeading(card: HTMLElement) {
  const selectors = [
    ":scope > h1",
    ":scope > h2",
    ":scope > h3",
    ":scope > div:first-child h1",
    ":scope > div:first-child h2",
    ":scope > div:first-child h3",
    ":scope > div:first-child > p:first-child"
  ];

  for (const selector of selectors) {
    const element = card.querySelector<HTMLElement>(selector);
    if (element?.textContent?.trim()) return element;
  }
  return null;
}

function createInfoTooltip(description: string) {
  const wrapper = document.createElement("span");
  wrapper.className = "card-info-help no-print";
  wrapper.setAttribute("aria-label", description);
  wrapper.setAttribute("tabindex", "0");
  wrapper.textContent = "i";

  const tooltip = document.createElement("span");
  tooltip.className = "card-info-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent = description;
  wrapper.append(tooltip);
  return wrapper;
}
