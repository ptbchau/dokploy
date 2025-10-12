# Issue #3: IP Address Whitespace Bug

## Bug Description

**Problem**: When users input server IP addresses with leading or trailing whitespace (e.g., `" 192.168.1.1 "`), SSH connections fail because the whitespace is not trimmed before attempting the connection.

**Impact**: Users experience confusing SSH connection failures and must manually re-enter IP addresses without spaces.

**Severity**: Medium - Causes user frustration and wastes time troubleshooting.

## Bug Flow Summary

```
User Input: " 192.168.1.100" (with leading space)
    ↓
Frontend Form: No trimming in Input field
    ↓
Zod Validation: z.string().min(1) - passes validation ✓
    ↓
API Call: ipAddress sent as-is with whitespace
    ↓
Backend Schema: No trimming in apiCreateServer schema
    ↓
Database: Stores " 192.168.1.100" with whitespace ✓
    ↓
SSH Connection: client.connect({ host: " 192.168.1.100" })
    ↓
DNS Lookup: Fails - "getaddrinfo ENOTFOUND  192.168.1.100" ❌
```

## Root Cause

The bug exists because **nowhere in the pipeline** is the IP address trimmed:
- ❌ Not in frontend input handler
- ❌ Not in frontend Zod schema  
- ❌ Not in backend API schema
- ❌ Not before SSH connection

## Fix Plan

### Solution: Add `.trim()` to Zod schemas at both frontend and backend levels

**Why this approach:**
- **Centralized validation**: Single point of truth for data sanitization
- **Defense in depth**: Multiple layers of protection
- **Minimal code changes**: Only 4 files, simple additions
- **Future-proof**: Any new forms using these schemas automatically get the fix

### Files to Modify

#### 1. Backend Schema (Primary Fix)
**File**: `packages/server/src/db/schema/server.ts`

```typescript
// Lines 126-135: apiCreateServer
export const apiCreateServer = createSchema
  .pick({
    name: true,
    description: true,
    ipAddress: true,
    port: true,
    username: true,
    sshKeyId: true,
  })
  .required()
  .extend({
    ipAddress: z.string().trim().min(1, {
      message: "IP Address is required",
    }),
    username: z.string().trim().optional(),
  });

// Lines 149-162: apiUpdateServer  
export const apiUpdateServer = createSchema
  .pick({
    name: true,
    description: true,
    serverId: true,
    ipAddress: true,
    port: true,
    username: true,
    sshKeyId: true,
  })
  .required()
  .extend({
    command: z.string().optional(),
    ipAddress: z.string().trim().min(1, {
      message: "IP Address is required",
    }),
    username: z.string().trim().optional(),
  });
```

#### 2. Frontend Schemas (User Experience)
**File**: `apps/dokploy/components/dashboard/settings/servers/handle-servers.tsx`

```typescript
// Lines 42-55
const Schema = z.object({
  name: z.string().min(1, {
    message: "Name is required",
  }),
  description: z.string().optional(),
  ipAddress: z.string().trim().min(1, {
    message: "IP Address is required",
  }),
  port: z.number().optional(),
  username: z.string().trim().optional(),
  sshKeyId: z.string().min(1, {
    message: "SSH Key is required",
  }),
});
```

**File**: `apps/dokploy/components/dashboard/settings/servers/welcome-stripe/create-server.tsx`

```typescript
// Lines 32-45
const Schema = z.object({
  name: z.string().min(1, {
    message: "Name is required",
  }),
  description: z.string().optional(),
  ipAddress: z.string().trim().min(1, {
    message: "IP Address is required",
  }),
  port: z.number().optional(),
  username: z.string().trim().optional(),
  sshKeyId: z.string().min(1, {
    message: "SSH Key is required",
  }),
});
```

**File**: `apps/dokploy/components/dashboard/settings/web-server/update-server-ip.tsx`

```typescript
// Update the schema to include trimming
const Schema = z.object({
  serverIp: z.string().trim().min(1, {
    message: "Server IP is required",
  }),
});
```

### Testing Strategy

1. **Create server** with `" 192.0.2.100"` (leading space)
2. **Verify** IP is stored as `192.0.2.100` (without space)
3. **Update server** with `"192.0.2.100 "` (trailing space)  
4. **Verify** IP is updated to `192.0.2.100` (without space)
5. **Attempt SSH connection** - should not fail due to whitespace

### Expected Behavior

**Before Fix:**
- Input: `" 192.168.1.100"` → Stored: `" 192.168.1.100"` → SSH fails ❌

**After Fix:**
- Input: `" 192.168.1.100"` → Stored: `192.168.1.100` → SSH works ✓
- Input: `"192.168.1.100 "` → Stored: `192.168.1.100` → SSH works ✓
- Input: `"  192.168.1.100  "` → Stored: `192.168.1.100` → SSH works ✓

## Implementation Order

1. **Backend Schema** (Most Critical) - Prevents bad data from reaching database
2. **Frontend Schemas** (User Experience) - Provides immediate feedback
3. **Testing** - Verify fix works with various whitespace scenarios

---

*This fix addresses the root cause by ensuring data is clean at the validation layer, providing both immediate user feedback and backend protection.*
