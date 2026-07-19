import { useHostStore } from "../state/store.js";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function SlideList({ collapsed, onToggle }: Props) {
  const slides = useHostStore((s) => s.state.slides);
  const activeIndex = useHostStore((s) => s.state.activeSlideIndex);
  const setActive = useHostStore((s) => s.setActiveSlide);
  const addSlide = useHostStore((s) => s.addSlide);
  const removeSlide = useHostStore((s) => s.removeSlide);
  const duplicateSlide = useHostStore((s) => s.duplicateSlide);
  const renameSlide = useHostStore((s) => s.renameSlide);

  if (collapsed) {
    return (
      <aside className="slide-list collapsed">
        <button className="ghost sl-toggle" onClick={onToggle} title="Aufklappen">
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="slide-list">
      <div className="sl-header">
        <h3>🎬 Slides</h3>
        <button className="ghost sl-toggle" onClick={onToggle} title="Einklappen">
          «
        </button>
      </div>
      <div className="sl-body">
        {slides.map((sl, i) => (
          <div
            key={sl.id}
            className={`sl-item ${i === activeIndex ? "active" : ""}`}
            onClick={() => setActive(i)}
          >
            <div className="sl-thumb" style={{ background: sl.background }}>
              {sl.elements.slice(0, 3).map((el) =>
                el.type === "image" && el.assetId ? (
                  <div
                    key={el.id}
                    className="sl-thumb-el"
                    style={{
                      left: `${el.x * 100}%`,
                      top: `${el.y * 100}%`,
                      width: `${el.w * 100}%`,
                      height: `${el.h * 100}%`,
                    }}
                  />
                ) : null
              )}
              <span className="sl-thumb-num">{i + 1}</span>
            </div>
            <input
              className="sl-name"
              value={sl.name}
              onChange={(e) => renameSlide(sl.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="sl-actions">
              <button
                className="ab-mini"
                title="Duplizieren"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateSlide(sl.id);
                }}
              >
                ⧉
              </button>
              {slides.length > 1 && (
                <button
                  className="ab-mini danger"
                  title="Löschen"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Slide „${sl.name}" löschen?`)) {
                      removeSlide(sl.id);
                    }
                  }}
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="primary sl-add" onClick={addSlide}>
        + Neue Slide
      </button>
    </aside>
  );
}
