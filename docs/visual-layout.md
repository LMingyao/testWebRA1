# Gallery spacing and viewing continuity

The existing wordmark, fonts, Work dropdown, collection label, mode controls, panorama controls, and brand accents remain unchanged.

## Composition

The layout preserves the source sequence and aspect ratios. Automatic rows can contain up to three photographs. Explicit groups and independent rows remain editorial choices; the algorithm does not infer groups from topic or color.

Base spacing is 24 CSS pixels on wide screens, 20 on intermediate screens, and 16 on small screens. A declared group boundary or the boundary around an independent row adds 20 pixels. These relationships survive mobile single-column layout. Independent photographs respect the available viewing height, including on mobile; narrow photographs remain centered within their row without cropping.

## Viewing continuity

Changing viewing mode retains the selected photograph. Returning to Multi restores its previous reading position when the same photograph and viewport are retained. Opening the viewer records the current photograph and scroll position. Closing the same photograph restores that position when viewport dimensions match. After choosing another photograph or changing viewport dimensions, closing focuses the selected photograph and scrolls only enough to reveal it. Oversized photographs align near the top.

Verify declared groups, independent portrait rows, mode changes, same-photo and changed-photo viewer closing, and viewport changes in both public pages and the private draft preview. Local editorial examples do not change the published selection or ordering.
