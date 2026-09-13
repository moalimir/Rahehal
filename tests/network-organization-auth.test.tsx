// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NetworkOrganizationLogin,
  NetworkOrganizationRegistration,
} from "@/components/portal/network-organization-login";

const startOrganizationLogin = vi.fn(async () => null);

vi.mock("@/components/runtime-provider", () => ({
  useWebRuntime: () => ({
    sessionStatus: "anonymous",
    startOrganizationLogin,
  }),
}));

afterEach(() => {
  cleanup();
  startOrganizationLogin.mockClear();
  window.history.replaceState({}, "", "/");
});

describe("ورود و شروع همکاری سازمان در runtime متصل", () => {
  it("ورود را به ارائه‌دهنده هویت می‌سپارد و مسیر شروع همکاری را جدا نگه می‌دارد", async () => {
    render(<NetworkOrganizationLogin />);

    expect(screen.getByRole("heading", { name: "ورود سازمان" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/راه‌حل گذرواژه شما را دریافت یا نگهداری نمی‌کند/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شروع همکاری برای سازمان جدید" })).toHaveAttribute(
      "href",
      "/auth/organization/register/representative",
    );

    fireEvent.click(screen.getByRole("button", { name: "ادامه برای ورود امن سازمانی" }));
    await waitFor(() => expect(startOrganizationLogin).toHaveBeenCalledOnce());
  });

  it("برای داور و عملیات همان ورود OIDC را با قاب‌بندی نقش درست نشان می‌دهد", async () => {
    window.history.replaceState({}, "", "/auth/organization/login?role=reviewer");
    const { unmount } = render(<NetworkOrganizationLogin />);

    expect(await screen.findByRole("heading", { name: "ورود داور" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادامه برای ورود امن داور" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "شروع همکاری برای سازمان جدید" })).toBeNull();

    unmount();
    window.history.replaceState({}, "", "/auth/organization/login?role=ops");
    render(<NetworkOrganizationLogin />);

    expect(await screen.findByRole("heading", { name: "ورود عملیات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ادامه برای ورود امن عملیات" })).toBeInTheDocument();
  });

  it("در connected mode فرم ثبت‌نام نمایشی را با onboarding کنترل‌شده جایگزین می‌کند", () => {
    render(<NetworkOrganizationRegistration />);

    expect(screen.getByRole("heading", { name: "شروع همکاری سازمانی" })).toBeInTheDocument();
    expect(screen.getByText(/عمومی و فوری نیست/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "دعوت‌نامه دارم؛ ورود سازمان" })).toHaveAttribute(
      "href",
      "/auth/organization/login",
    );
    expect(screen.getByRole("link", { name: "آشنایی با مسیر همکاری سازمان‌ها" })).toHaveAttribute(
      "href",
      "/for-organizations",
    );
  });
});
