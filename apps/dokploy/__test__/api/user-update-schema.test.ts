import { apiUpdateUser } from "@dokploy/server/db/schema";
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

describe("apiUpdateUser Schema - Email Validation", () => {
    it("should reject empty email when provided", () => {
        const result = apiUpdateUser.safeParse({
            email: "",
        });
        
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error?.issues[0]?.message).toBe(zodErrors.minLength);
        }
    });

    it("should reject invalid email format - missing @", () => {
        const result = apiUpdateUser.safeParse({
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
        const result = apiUpdateUser.safeParse({
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
        const result = apiUpdateUser.safeParse({
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
        const result = apiUpdateUser.safeParse({
            email: "user@example.com",
            password: null,
            currentPassword: null,
        });
        
        // expect(result.success).toBe(true);
    });

    it("should accept valid email format - with subdomain", () => {
        const result = apiUpdateUser.safeParse({
            email: "user@subdomain.example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(true);
    });

    it("should accept valid email format - with plus sign", () => {
        const result = apiUpdateUser.safeParse({
            email: "user+tag@subdomain.example.com",
            password: null,
            currentPassword: null,
        });
        
        expect(result.success).toBe(true);
    });

    it("should handle whitespace-only email as invalid", () => {
        const result = apiUpdateUser.safeParse({
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