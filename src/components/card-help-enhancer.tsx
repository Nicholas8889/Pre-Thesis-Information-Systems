"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getCardTitle } from "@/lib/card-help";

export function CardHelpEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname.endsWith("/print")) return;

    const enhanceCards = () => {
      document
        .querySelectorAll<HTMLElement>("main .shadow-card:not(.print-page)")
        .forEach((card) => enhanceCard(card, pathname));
    };

    const container = document.querySelector("main") ?? document.body;
    enhanceCards();
    let enhancementScheduled = false;
    const observer = new MutationObserver((mutations) => {
      if (!mutationsContainCard(mutations) || enhancementScheduled) return;
      enhancementScheduled = true;
      requestAnimationFrame(() => {
        enhancementScheduled = false;
        enhanceCards();
      });
    });
    observer.observe(container, {
      childList: true,
      subtree: true
    });
    return () => {
      observer.disconnect();
      resetCardEnhancements(container);
    };
  }, [pathname]);

  return null;
}

function mutationsContainCard(mutations: MutationRecord[]) {
  return mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches(".shadow-card") || Boolean(node.querySelector(".shadow-card"));
    })
  );
}

function resetCardEnhancements(container: Element) {
  container
    .querySelectorAll<HTMLElement>("[data-card-help-enhanced='true']")
    .forEach((card) => {
      card.querySelector(":scope > .card-generated-header")?.remove();
      delete card.dataset.cardHelpEnhanced;
    });
}

function enhanceCard(card: HTMLElement, pathname: string) {
  if (card.dataset.cardHelpEnhanced === "true") return;
  card.dataset.cardHelpEnhanced = "true";

  const heading = findCardHeading(card);
  if (heading) return;

  const titleText = getCardTitle({
    pathname,
    hasTable: Boolean(card.querySelector("table")),
    hasForm: Boolean(card.querySelector("form"))
  });

  const header = document.createElement("div");
  header.className = "card-generated-header no-print";
  const title = document.createElement("h2");
  title.className = "text-lg font-semibold text-ink";
  title.textContent = titleText;
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
