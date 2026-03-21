/**
 * Canonical forms stack: React Hook Form + Zod + shadcn Form primitives.
 * Import from here in feature code so validation and layout stay consistent.
 */
export { z } from "zod";
export { zodResolver } from "@hookform/resolvers/zod";
export {
  useForm,
  useFormContext,
  useFormState,
  useWatch,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/components/ui/form";
