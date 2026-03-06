import type { ChangeEvent } from "react";

type PresetSelectorProps = {
  options: string[];
  preset: string;
  presetFilePath?: string;
  onPresetChange: (preset: string) => void;
  onPresetFileChange: (path: string) => void;
};

export function PresetSelector({
  options,
  preset,
  presetFilePath,
  onPresetChange,
  onPresetFileChange,
}: PresetSelectorProps) {
  const handlePresetFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPath = event.target.value;
    onPresetFileChange(nextPath);
    onPresetChange(nextPath ? "__file__" : "");
  };

  return (
    <div className="preset-selector">
      <label>
        <span>Program</span>
        <select value={preset !== "__file__" ? preset : ""} onChange={(event) => onPresetChange(event.target.value)}>
          <option value="">No preset</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>.vstpreset path</span>
        <input
          type="text"
          placeholder="/path/to/preset.vstpreset"
          value={presetFilePath ?? ""}
          onChange={handlePresetFileInput}
        />
      </label>
    </div>
  );
}
