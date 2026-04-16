import { useMemo, useState } from "react";
import { Check, Dna, Search } from "lucide-react";
import { SPECIES_OPTIONS } from "@/data/species";

interface SpeciesSearchSelectorProps {
  selectedValue: string;
  onSelect: (value: string) => void;
}

export function SpeciesSearchSelector({
  selectedValue,
  onSelect
}: SpeciesSearchSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSpecies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = !query
      ? SPECIES_OPTIONS
      : SPECIES_OPTIONS.filter((species) =>
          [species.label, species.name, species.assembly, species.id].some((value) =>
            value.toLowerCase().includes(query)
          )
        );

    if (!selectedValue) {
      return matches;
    }

    return [...matches].sort((left, right) => {
      if (left.label === selectedValue) {
        return -1;
      }
      if (right.label === selectedValue) {
        return 1;
      }
      return 0;
    });
  }, [searchQuery, selectedValue]);

  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((species) => species.label === selectedValue) ?? null,
    [selectedValue]
  );

  return (
    <div className="species-selector">
      <div className="species-selector__search">
        <Search size={16} />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search species / assembly / ID (e.g. hg38, Oryza, osa_IRGSP_1)..."
        />
      </div>

      <div className="species-selector__panel">
        <div className="species-selector__list">
          {filteredSpecies.length > 0 ? (
            filteredSpecies.map((species) => {
              const isSelected = species.label === selectedValue;

              return (
                <button
                  key={species.label}
                  type="button"
                  className={`species-item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => onSelect(isSelected ? "" : species.label)}
                >
                  <div className="species-item__main">
                    <div className="species-item__icon">
                      <Dna size={14} />
                    </div>
                    <div className="species-item__copy">
                      <h4>{species.name}</h4>
                      <p>{species.assembly}</p>
                      <span>ID: {species.id}</span>
                    </div>
                  </div>
                  <div className="species-item__check">
                    {isSelected ? <Check size={10} strokeWidth={4} /> : null}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="species-selector__empty">No matching species found.</div>
          )}
        </div>

        <div className="species-selector__footer">
          <span>Selected Genome</span>
          <strong>{selectedSpecies ? selectedSpecies.label : "None Selected"}</strong>
        </div>
      </div>
    </div>
  );
}
