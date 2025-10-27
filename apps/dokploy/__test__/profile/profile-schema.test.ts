import { profileSchema } from "@/components/dashboard/settings/profile/profile-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Helper to get Zod's default error messages
const getZodEmailErrors = () => {
    const emptyResult = z.string().min(1).safeParse("");
    const invalidResult = z.string().email().safeParse("notanemail");
    
    return {
        minLength: !emptyResult.success ? emptyResult.error?.issues[0]?.message : "",
        invalidEmail: !invalidResult.success ? invalidResult.error?.issues[0]?.message : "",
    };
};

const zodErrors = getZodEmailErrors();

describe("Profile Schema - Email Validation", () => {
    it("should reject empty email", () => {
        const result = profileSchema.safeParse({
            email: "",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.minLength);
        }
    });

    it("should reject invalid email format - missing @", () => {
        const result = profileSchema.safeParse({
            email: "notanemail",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.invalidEmail);
        }
    });

    it("should reject invalid email format - missing domain", () => {
        const result = profileSchema.safeParse({
            email: "test@",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.invalidEmail);
        }
    });

    it("should reject invalid email format - missing local part", () => {
        const result = profileSchema.safeParse({
            email: "@example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.invalidEmail);
        }
    });

    it("should accept valid email format", () => {
        const result = profileSchema.safeParse({
            email: "user@example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(true);
    });

    it("should accept valid email format - with subdomain", () => {
        const result = profileSchema.safeParse({
            email: "user@subdomain.example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(true);
    });

    it("should accept valid email format - with plus sign", () => {
        const result = profileSchema.safeParse({
            email: "user+tag@subdomain.example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(true);
    });

    it("should handle whitespace-only email as invalid", () => {
        const result = profileSchema.safeParse({
            email: "     ",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.invalidEmail);
        }
    });
});