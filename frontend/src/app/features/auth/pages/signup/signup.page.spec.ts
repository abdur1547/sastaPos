import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";

import { AuthService } from "../../../../core/auth/auth.service";
import { OnboardingProgressService } from "../../../../core/onboarding/onboarding-progress.service";
import { SignupPage } from "./signup.page";

class TestSignupPage extends SignupPage {
  readonly fields = this.form;
  submitSignup = () => this.submit();
}

describe("signup onboarding entry", () => {
  const auth = { signup: jest.fn() };
  const progress = { save: jest.fn() };
  const router = { navigate: jest.fn() };
  let page: TestSignupPage;

  beforeEach(() => {
    jest.resetAllMocks();
    auth.signup.mockResolvedValue(undefined);
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: OnboardingProgressService, useValue: progress },
        { provide: Router, useValue: router },
      ],
    });
    page = TestBed.runInInjectionContext(() => new TestSignupPage());
    page.fields.setValue({
      name: "Owner",
      email: "owner@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
  });

  it("starts store setup only after successful signup", async () => {
    await page.submitSignup();
    expect(auth.signup).toHaveBeenCalledWith({
      name: "Owner",
      email: "owner@example.com",
      password: "password123",
    });
    expect(progress.save).toHaveBeenCalledWith(0);
    expect(router.navigate).toHaveBeenCalledWith(["/onboarding"]);
  });

  it("does not create a checkpoint or enter setup when signup fails", async () => {
    auth.signup.mockRejectedValue(new Error("Cannot reach server"));
    await page.submitSignup();
    expect(progress.save).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
