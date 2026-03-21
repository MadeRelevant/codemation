# Forms (next-host)

## Stack

- **React Hook Form** — performant, accessible field registration and submission.
- **Zod** (v3 in this package) — schema validation at the boundary; infer TypeScript types from schemas. Kept on **Zod 3** for stable `@hookform/resolvers/zod` typings.
- **`@hookform/resolvers/zod`** — connect Zod to RHF via `zodResolver`.
- **UI** — `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` from `@/components/ui/form`, wrapping `@/components/ui/input`, `Label`, etc.

## Pattern

1. Define a Zod schema (co-locate under the feature or a small `*Schema.ts` module).
2. `useForm` with `resolver: zodResolver(schema)` and `defaultValues`.
3. Wrap the form in `<Form {...form}>` (alias of `FormProvider`).
4. For each field, use `FormField` + `FormItem` + `FormLabel` + `FormControl` + your `Input` / `Select` / `Textarea`.
5. Surface field errors with `FormMessage`; optional help with `FormDescription`.
6. Submit with `form.handleSubmit(onValid)`.

## Imports

Prefer the barrel so agents don’t mix ad-hoc stacks:

```ts
import { z, zodResolver, useForm, Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/forms";
import { Input } from "@/components/ui/input";
```

## ESLint

`packages/next-host/eslint.config.mjs` forbids raw `<input>` and `<textarea>` outside `src/components/ui/**` (primitives live there). Use `Input` / `Textarea` + the form components above.

## References

- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)
- [shadcn/ui Form](https://ui.shadcn.com/docs/components/form)
