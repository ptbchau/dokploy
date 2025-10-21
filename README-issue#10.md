# Issue #10: Add Name Field to User Profile Form

## Overview
This document outlines the implementation steps to add a name field to the user profile form, allowing users to set and update their display name in their profile settings.

## Problem Statement
Currently, the profile form only allows users to update their email, password, and other settings, but there's no way to specify or change their name. Although the underlying user schema already includes a name field, it is not exposed in the current profile form UI.

## Expected Behavior
- A Name input field is visible in the profile form UI
- Name field is displayed on the bottom left of the side-panel replacing "Account"
- The name field is properly integrated with the form validation schema as an optional field
- The name value is correctly loaded from the user's existing profile data when the form initializes
- When the form is submitted, the name value is included in the update request
- After successful submission, the name field retains the updated value

## Understanding the Current Data Flow

Before implementing the fix, it's important to understand how the existing profile form works and how data flows through the system.

### Data Flow Diagram

```
Database (PostgreSQL) 
    ↓
Database Schema (users_temp table)
    ↓
Backend API (tRPC Router)
    ↓
Frontend API Client (tRPC)
    ↓
React Component (ProfileForm)
    ↓
Form State (React Hook Form)
    ↓
UI Components (Input Fields)
```

### Detailed Data Flow Explanation

#### A. Data Retrieval (Display) Flow

**1. Database Layer:**
```typescript
// File: packages/server/src/db/schema/user.ts (lines 28-33)
export const users_temp = pgTable("user_temp", {
	id: text("id").notNull().primaryKey().$defaultFn(() => nanoid()),
	name: text("name").notNull().default(""), // ← Name field already exists here
	email: text("email").notNull().unique(),
	// ... other fields
});
```

**2. Backend API Layer:**
```typescript
// File: apps/dokploy/server/api/routers/user.ts (lines 80-96)
get: protectedProcedure.query(async ({ ctx }) => {
	const memberResult = await db.query.member.findFirst({
		where: and(
			eq(member.userId, ctx.user.id),
			eq(member.organizationId, ctx.session?.activeOrganizationId || ""),
		),
		with: {
			user: {
				with: {
					apiKeys: true,
				},
			},
		},
	});
	return memberResult; // ← Returns user data including name
}),
```

**3. Frontend API Client:**
```typescript
// File: apps/dokploy/components/dashboard/settings/profile/profile-form.tsx (line 61)
const { data, refetch, isLoading } = api.user.get.useQuery();
// ↑ This calls the backend API and gets user data
```

**4. Form Initialization:**
```typescript
// File: apps/dokploy/components/dashboard/settings/profile/profile-form.tsx (lines 80-89)
const form = useForm<Profile>({
	defaultValues: {
		email: data?.user?.email || "",
		// name: data?.user?.name || "", // ← This is where name would go
		password: "",
		image: data?.user?.image || "",
		currentPassword: "",
		allowImpersonation: data?.user?.allowImpersonation || false,
	},
	resolver: zodResolver(profileSchema),
});
```

**5. Form Reset (when data loads):**
```typescript
// File: apps/dokploy/components/dashboard/settings/profile/profile-form.tsx (lines 91-113)
useEffect(() => {
	if (data) {
		form.reset({
			email: data?.user?.email || "",
			// name: data?.user?.name || "", // ← This is where name would go
			password: form.getValues("password") || "",
			image: data?.user?.image || "",
			currentPassword: form.getValues("currentPassword") || "",
			allowImpersonation: data?.user?.allowImpersonation,
		});
	}
}, [form, data]);
```

#### B. Data Update (Submission) Flow

**1. Form Submission:**
```typescript
// File: apps/dokploy/components/dashboard/settings/profile/profile-form.tsx (lines 115-136)
const onSubmit = async (values: Profile) => {
	await mutateAsync({
		email: values.email.toLowerCase(),
		// name: values.name, // ← This is where name would go
		password: values.password || undefined,
		image: values.image,
		currentPassword: values.currentPassword || undefined,
		allowImpersonation: values.allowImpersonation,
	})
	.then(async () => {
		await refetch(); // ← Refetch data after update
		toast.success("Profile Updated");
		// ... form reset
	});
};
```

**2. Backend API Update:**
```typescript
// File: apps/dokploy/server/api/routers/user.ts (lines 145-178)
update: protectedProcedure
	.input(apiUpdateUser) // ← Schema validation
	.mutation(async ({ input, ctx }) => {
		// ... password validation logic
		return await updateUser(ctx.user.id, input); // ← Calls service function
	}),
```

**3. Service Layer Update:**
```typescript
// File: packages/server/src/services/user.ts (lines 240-251)
export const updateUser = async (userId: string, userData: Partial<User>) => {
	const user = await db
		.update(users_temp)
		.set({
			...userData, // ← This includes name if provided
		})
		.where(eq(users_temp.id, userId))
		.returning()
		.then((res) => res[0]);
	return user;
};
```

**4. Database Update:**
```sql
-- The actual SQL that gets executed
UPDATE user_temp 
SET name = $1, email = $2, image = $3, ... 
WHERE id = $userId
```

### Key Components in the Flow

#### Frontend Components:
1. **`ProfileForm`** - Main form component (`apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`)
2. **`useForm`** - React Hook Form for form state management
3. **`api.user.get.useQuery()`** - Data fetching hook
4. **`api.user.update.useMutation()`** - Data updating hook

#### Backend Components:
1. **`userRouter`** - tRPC router with get/update endpoints (`apps/dokploy/server/api/routers/user.ts`)
2. **`updateUser`** - Service function for database operations (`packages/server/src/services/user.ts`)
3. **`users_temp`** - Database table schema (`packages/server/src/db/schema/user.ts`)
4. **`apiUpdateUser`** - Input validation schema (`packages/server/src/db/schema/user.ts`)

#### Data Flow Steps:

**For Displaying Data:**
1. **Database** → **Backend API** → **Frontend API** → **Form State** → **UI Components**

**For Updating Data:**
1. **UI Input** → **Form State** → **Frontend API** → **Backend API** → **Service Layer** → **Database**

### Side Panel Display Flow

The side panel gets user data through the same API:

```typescript
// File: apps/dokploy/components/layouts/user-nav.tsx (lines 31, 52)
const { data } = api.user.get.useQuery(); // ← Same API call

// Display logic
<span className="truncate font-semibold">
	{data?.user?.name || "Account"} // ← This is where name would be displayed
</span>
```

This means when you update the name in the profile form, it will automatically appear in the side panel because both components use the same data source (`api.user.get.useQuery()`).

### Why the Name Field is Missing

The name field already exists in the database schema (`name: text("name").notNull().default("")`), and the backend API already supports name updates because the `updateUser` function accepts any user field via `...userData`. The issue is that the frontend form doesn't include the name field in:

1. **Form Schema** - The validation schema doesn't include name
2. **Form Default Values** - The form doesn't load existing name data
3. **Form Submission** - The form doesn't send name data to the backend
4. **UI Components** - There's no input field for the name
5. **Side Panel Display** - The side panel shows "Account" instead of the user's name

## Implementation Steps

### Step 1: Update the Form Schema (Frontend)
**File:** `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
**Lines:** 34-40

Add the `name` field to the profile form schema:

```typescript
const profileSchema = z.object({
	email: z.string(),
	name: z.string().optional(), // Add this line
	password: z.string().nullable(),
	currentPassword: z.string().nullable(),
	image: z.string().optional(),
	allowImpersonation: z.boolean().optional().default(false),
});
```

**Why:** This defines what data the form can handle and validates the name field as optional.

### Step 2: Add Name Field to Form Default Values
**File:** `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
**Lines:** 80-89 and 93-104

Include the name field in the form's default values and reset logic:

```typescript
// Update defaultValues (around line 80-89)
const form = useForm<Profile>({
	defaultValues: {
		email: data?.user?.email || "",
		name: data?.user?.name || "", // Add this line
		password: "",
		image: data?.user?.image || "",
		currentPassword: "",
		allowImpersonation: data?.user?.allowImpersonation || false,
	},
	resolver: zodResolver(profileSchema),
});

// Update the reset logic in useEffect (around line 93-104)
form.reset(
	{
		email: data?.user?.email || "",
		name: data?.user?.name || "", // Add this line
		password: form.getValues("password") || "",
		image: data?.user?.image || "",
		currentPassword: form.getValues("currentPassword") || "",
		allowImpersonation: data?.user?.allowImpersonation,
	},
	{
		keepValues: true,
	},
);
```

**Why:** This ensures the form loads existing name data and handles form resets properly.

### Step 3: Add Name Field to Form Submission
**File:** `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
**Lines:** 115-122

Include the name field in the form submission logic:

```typescript
const onSubmit = async (values: Profile) => {
	await mutateAsync({
		email: values.email.toLowerCase(),
		name: values.name, // Add this line
		password: values.password || undefined,
		image: values.image,
		currentPassword: values.currentPassword || undefined,
		allowImpersonation: values.allowImpersonation,
	})
		.then(async () => {
			await refetch();
			toast.success("Profile Updated");
			form.reset({
				name: values.name, // Add this line
				email: values.email,
				password: "",
				image: values.image,
				currentPassword: "",
			});
		})
};
```

**Why:** This ensures the name gets sent to the backend when the form is submitted.

### Step 4: Add Name Input Field to the UI
**File:** `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
**Location:** After line 185 (after the email field)

Add the actual name input field to the form:

```typescript
<FormField
	control={form.control}
	name="name"
	render={({ field }) => (
		<FormItem>
			<FormLabel>Name</FormLabel>
			<FormControl>
				<Input
					placeholder="Enter your name"
					{...field}
				/>
			</FormControl>
			<FormMessage />
		</FormItem>
	)}
/>
```

**Why:** This creates the visual input field for users to enter their name.

### Step 5: Add Translation Keys for Name Field
**Files:** All language files in `apps/dokploy/public/locales/*/settings.json`

Add the missing translation key for the name field label:

```json
"settings.profile.name": "Name",  // Add this line after settings.profile.email
```

**Why:** The name field uses `t("settings.profile.name")` for the label, but this translation key was missing from all language files. This ensures consistent, properly translated labels across all supported languages and prevents the raw translation key from being displayed to users.

### Step 6: Update the Side Panel Display
**File:** `apps/dokploy/components/layouts/user-nav.tsx`
**Line:** 52

Replace "Account" with the user's name in the side panel:

```typescript
<span className="truncate font-semibold">
	{data?.user?.name || "Account"}
</span>
```

**Why:** This shows the user's name instead of "Account" in the bottom left of the side panel.

### Step 7: Verify Backend Support
**Files to check:**
- `packages/server/src/db/schema/schema.dbml` (line 719)
- `packages/server/src/db/schema/user.ts`
- `apps/dokploy/server/api/routers/user.ts`

**Verification needed:**

**1. Database Schema Verification:**
```typescript
// File: packages/server/src/db/schema/user.ts (line 33)
export const users_temp = pgTable("user_temp", {
	id: text("id").notNull().primaryKey().$defaultFn(() => nanoid()),
	name: text("name").notNull().default(""), // ← Name field exists
	email: text("email").notNull().unique(),
	// ... other fields
});
```
✅ **Verified:** The `name` field exists in the database schema with type `text` and default value `""`.

**2. Backend API Service Function Verification:**
```typescript
// File: packages/server/src/services/user.ts (lines 240-251)
export const updateUser = async (userId: string, userData: Partial<User>) => {
	const user = await db
		.update(users_temp)
		.set({
			...userData, // ← This spread operator accepts ANY user field
		})
		.where(eq(users_temp.id, userId))
		.returning()
		.then((res) => res[0]);
	return user;
};
```
✅ **Verified:** The `...userData` spread operator means this function accepts **any field** from the User type, including `name`.

**3. API Schema Verification:**
```typescript
// File: packages/server/src/db/schema/user.ts (lines 136-141, 298)
const createSchema = createInsertSchema(users_temp, {
	id: z.string().min(1),
	isRegistered: z.boolean().optional(),
}).omit({
	role: true,
});

export const apiUpdateUser = createSchema.partial().extend({
	password: z.string().optional(),
	currentPassword: z.string().optional(),
	// ... other specific fields
});
```
✅ **Verified:** 
- `createSchema` is created from `users_temp` table, which includes the `name` field
- `apiUpdateUser` extends `createSchema.partial()`, meaning it includes ALL fields from the table as optional
- The `name` field is automatically included because it's part of the base schema

**4. API Router Verification:**
```typescript
// File: apps/dokploy/server/api/routers/user.ts (lines 145-178)
update: protectedProcedure
	.input(apiUpdateUser) // ← Uses the schema that includes name
	.mutation(async ({ input, ctx }) => {
		// ... password validation logic
		return await updateUser(ctx.user.id, input); // ← Passes all input to updateUser
	}),
```
✅ **Verified:** The API router uses `apiUpdateUser` schema and passes all input to `updateUser` function.

**Summary:** The backend is **already fully prepared** to handle name updates. The database schema includes the `name` field, the service function accepts any user field via `...userData`, the API schema includes all table fields as optional, and the API router passes all input to the service function. The only missing piece is the frontend form - it doesn't send the `name` field in the request.

**Why:** The database schema and API should already support name updates, but we need to verify this.

### Step 8: Test the Implementation
**Manual Testing Steps:**

1. **Navigate to profile settings**
   - Go to Settings → Profile
   - Verify the name field appears in the form

2. **Test form functionality**
   - Enter a name in the field
   - Submit the form
   - Verify success message appears

3. **Test side panel display**
   - Check that the name appears in the bottom left of the side panel instead of "Account"

4. **Test persistence**
   - Refresh the page
   - Verify the name value persists and is loaded correctly

5. **Test optional behavior**
   - Clear the name field
   - Submit the form
   - Verify it still works (since name is optional)

6. **Test updates**
   - Change the name to a different value
   - Submit the form
   - Verify the change is saved

## Files Modified

1. `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
   - Add name to schema
   - Add name to default values and reset logic
   - Add name to form submission
   - Add name input field to UI

2. `apps/dokploy/components/layouts/user-nav.tsx`
   - Update side panel to show name instead of "Account"

## Acceptance Criteria

- [ ] A Name input field is visible in the profile form UI
- [ ] Name field is displayed on the bottom left of the side-panel replacing "Account"
- [ ] The name field is properly integrated with the form validation schema as an optional field
- [ ] The name value is correctly loaded from the user's existing profile data when the form initializes
- [ ] When the form is submitted, the name value is included in the update request
- [ ] After successful submission, the name field retains the updated value

## Testing

### Manual Testing
1. Navigate to the profile settings page
2. Verify that a Name input field is displayed in the form
3. Enter a name in the field and submit the form
4. Confirm the form submission succeeds without errors
5. Refresh the page and verify the name value persists
6. Test leaving the name field empty and verify the form still submits successfully (since it's optional)
7. Test updating the name to a different value and verify the change is saved

### Automated Testing
1. Run the existing test suite to ensure no regressions: `npm test`
2. Verify that form validation passes with and without a name value provided

## Notes

- The name field is optional, so users can leave it empty
- The backend should already support name updates since the database schema includes the name field
- The implementation follows the existing patterns in the codebase for form handling
- All changes are backward compatible

## Related Files

- Frontend Form: `apps/dokploy/components/dashboard/settings/profile/profile-form.tsx`
- Side Panel: `apps/dokploy/components/layouts/user-nav.tsx`
- Database Schema: `packages/server/src/db/schema/schema.dbml`
- User Schema: `packages/server/src/db/schema/user.ts`
- API Router: `apps/dokploy/server/api/routers/user.ts`
