document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const studioData = [
    ["مسئله و ارزش کسب‌وکار", "هزینه وضع موجود", "۹٬۶۰۰٬۰۰۰٬۰۰۰ تومان در سال"],
    ["شرح فنی و معیار پذیرش", "معیار اصلی پذیرش", "کاهش حداقل ۲۵٪ مصرف؛ ATP کمتر از ۳۰ RLU"],
    ["قواعد مشارکت و داوری", "حد نصاب امتیاز", "۷۰ از ۱۰۰ و عبور از Gate ایمنی"],
    [
      "حقوق، بودجه و انتشار",
      "مدل Foreground IP",
      "مالکیت مشترک؛ مجوز بهره‌برداری صنعتی برای سازمان",
    ],
  ];

  const toast = document.getElementById("toast");
  const showToast = (message) => {
    if (!toast) return;
    const text = toast.querySelector("p");
    if (text) text.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  };

  document
    .querySelector("[data-close-notice]")
    ?.addEventListener("click", () => document.getElementById("notice")?.remove());
  toast?.querySelector("button")?.addEventListener("click", () => {
    toast.hidden = true;
  });
  document
    .querySelectorAll("[data-toast]")
    .forEach((button) =>
      button.addEventListener("click", () => showToast(button.dataset.toast || "اقدام ثبت شد.")),
    );

  const menu = document.getElementById("mobile-menu");
  const menuButton = document.querySelector("[data-menu]");
  const closeMenu = () => {
    if (menu) menu.hidden = true;
    menuButton?.setAttribute("aria-expanded", "false");
  };
  menuButton?.addEventListener("click", () => {
    if (menu) menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    menu?.querySelector("a")?.focus();
  });
  document.querySelector("[data-menu-close]")?.addEventListener("click", closeMenu);
  menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".company-rail, .category-rail").forEach((rail) => {
    const items = [...rail.children];
    const dotsRoot = document.querySelector(`[data-carousel-dots="${rail.id}"]`);
    const relatedButtons = document.querySelectorAll(`[data-carousel-target="${rail.id}"]`);
    let index = 0;
    let timer;

    const dots = items.map((item, dotIndex) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `نمایش مورد ${(dotIndex + 1).toLocaleString("fa-IR")}`);
      dot.addEventListener("click", () => goTo(dotIndex));
      dotsRoot?.append(dot);
      return dot;
    });

    const updateDots = () =>
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("active", dotIndex === index);
        dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
      });

    const goTo = (next) => {
      index = (next + items.length) % items.length;
      const target = items[index];
      if (target) {
        const railBox = rail.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        rail.scrollBy({
          left: targetBox.left - railBox.left - (railBox.width - targetBox.width) / 2,
          behavior: "smooth",
        });
      }
      updateDots();
    };

    const stop = () => window.clearInterval(timer);
    const start = () => {
      stop();
      if (prefersReducedMotion) return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") goTo(index + 1);
      }, 5200);
    };

    relatedButtons.forEach((button) =>
      button.addEventListener("click", () => {
        goTo(index + Number(button.dataset.carouselDirection || 1));
        start();
      }),
    );
    rail.addEventListener("pointerenter", stop);
    rail.addEventListener("pointerleave", start);
    rail.addEventListener("focusin", stop);
    rail.addEventListener("focusout", start);
    updateDots();
    start();
  });

  document.querySelectorAll("[data-studio]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.studio);
      const item = studioData[index];
      document.querySelectorAll("[data-studio]").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      document.getElementById("studio-step").textContent = (index + 1).toLocaleString("fa-IR");
      document.getElementById("studio-title").textContent = item[0];
      document.getElementById("studio-label").textContent = item[1];
      document.getElementById("studio-value").textContent = item[2];
    }),
  );

  const topButton = document.querySelector("[data-top]");
  window.addEventListener(
    "scroll",
    () => topButton?.classList.toggle("show", window.scrollY > 700),
    { passive: true },
  );
  topButton?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
});
