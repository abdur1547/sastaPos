import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";

import { AuthService } from "../../../../core/auth/auth.service";
import { OnboardingProgressService } from "../../../../core/onboarding/onboarding-progress.service";
import { LoginPage } from "./login.page";

class TestLoginPage extends LoginPage {
  readonly fields = this.form;
  signIn = () => this.submit();
}

describe("login setup routing", () => {
  const auth = { login: jest.fn(), notice: signal(null) };
  const onboarding = { required: jest.fn() };
  const router = { navigate: jest.fn() };
  let page: TestLoginPage;

  beforeEach(() => {
    jest.resetAllMocks();
    auth.login.mockResolvedValue(undefined);
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: OnboardingProgressService, useValue: onboarding },
        { provide: Router, useValue: router },
      ],
    });
    page = TestBed.runInInjectionContext(() => new TestLoginPage());
    page.fields.setValue({
      email: "user@example.com",
      password: "password123",
    });
  });

  it.each([
    [true, "/onboarding"],
    [false, "/sell"],
  ])(
    "routes setup-required=%p to %s after successful login",
    async (required, destination) => {
      onboarding.required.mockReturnValue(required);
      await page.signIn();
      expect(auth.login).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
      });
      expect(router.navigate).toHaveBeenCalledWith([destination]);
    },
  );

  it("does not navigate after a failed login", async () => {
    auth.login.mockRejectedValue(new Error("Login failed"));
    await page.signIn();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
