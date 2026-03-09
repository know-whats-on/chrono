import React from "react";
import { Search } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";

export interface SearchInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, ...props }, ref) => {
    return (
      <div className={cn("relative flex items-center", containerClassName)}>
        <Search className="absolute left-3 h-4 w-4 text-gray-400" />
        <Input
          ref={ref}
          className={cn(
            "h-9 rounded-[10px] bg-[#767680]/[0.12] pl-9 border-none shadow-none text-[17px] focus-visible:ring-0 placeholder:text-[17px] placeholder:text-[#3C3C43]/60 w-full",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";
