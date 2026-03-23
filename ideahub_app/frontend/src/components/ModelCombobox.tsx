import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2, Check } from 'lucide-react';
import type { AvailableModel } from '../types';

interface ModelComboboxProps {
  value: string;
  onChange: (value: string) => void;
  models: AvailableModel[];
  loading?: boolean;
  placeholder?: string;
  source?: 'api' | 'fallback' | 'error' | null;
  disabled?: boolean;
}

export default function ModelCombobox({
  value,
  onChange,
  models,
  loading = false,
  placeholder = '选择或输入模型名称',
  source = null,
  disabled = false,
}: ModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update inputValue when value prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset input to actual value when closing
        setInputValue(value);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  // Filter models based on input
  const filteredModels = models.filter(
    (model) =>
      model.id.toLowerCase().includes(inputValue.toLowerCase()) ||
      model.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleSelect = (model: AvailableModel) => {
    setInputValue(model.id);
    onChange(model.id);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue(value);
      inputRef.current?.blur();
    } else if (e.key === 'Enter' && filteredModels.length > 0) {
      e.preventDefault();
      handleSelect(filteredModels[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`memphis-input pr-10 ${
            disabled ? 'bg-gray-100 cursor-not-allowed opacity-60' : ''
          }`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading ? (
            <Loader2 className="w-4 h-4 text-[var(--memphis-primary)] animate-spin" />
          ) : (
            <ChevronDown
              className={`w-4 h-4 text-[var(--memphis-dark)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </div>

      {/* Dropdown - Memphis Style */}
      {isOpen && !disabled && (models.length > 0 || inputValue) && (
        <div className="absolute z-50 w-full mt-2 bg-white border-[var(--memphis-border-width)] border-[var(--memphis-dark)] rounded-[var(--memphis-radius)] shadow-[4px_4px_0_var(--memphis-dark)] max-h-60 overflow-auto">
          {filteredModels.length > 0 ? (
            <>
              {filteredModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={`w-full px-3 py-2.5 text-left transition-colors flex items-center justify-between border-b border-[var(--memphis-dark)] last:border-b-0 ${
                    model.id === value 
                      ? 'bg-[var(--memphis-accent1)]' 
                      : 'hover:bg-[var(--memphis-bg)]'
                  }`}
                >
                  <div>
                    <div className="font-bold text-[var(--memphis-dark)] text-sm">{model.id}</div>
                    {model.name !== model.id && (
                      <div className="text-xs text-[var(--memphis-dark)] opacity-60">{model.name}</div>
                    )}
                  </div>
                  {model.id === value && <Check className="w-4 h-4 text-[var(--memphis-dark)]" />}
                </button>
              ))}
              {source === 'fallback' && (
                <div className="px-3 py-2 text-xs text-[var(--memphis-dark)] opacity-50 border-t-2 border-dashed border-[var(--memphis-dark)] bg-[var(--memphis-bg)]">
                  （推荐模型列表，非实时查询）
                </div>
              )}
            </>
          ) : (
            <div className="px-3 py-3 text-sm text-[var(--memphis-dark)] opacity-60 bg-[var(--memphis-bg)]">
              没有匹配的模型，将使用自定义名称
            </div>
          )}
        </div>
      )}
    </div>
  );
}
