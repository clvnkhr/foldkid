export interface CharacterLabGlyph {
  readonly path: string
  readonly viewBox: string
  readonly transform: string
}

// Font-independent 𠃓 (U+200D3), extracted without changing its three source outlines.
// Hanzi Writer Data 2.0.1, 杨.json strokes 4–6 (zero-based); its first four strokes are 木.
// Make Me a Hanzi's 杨 stroke matches independently identify those last three as the right component.
// Copyright 1999 Arphic Technology Co., Ltd.; Arphic Public License.
// Source/license: public/chinese-handwriting/SOURCES.md and ARPHICPL.TXT.
// Original 杨.json SHA-256: 253395bf4747535ddc0fb8379c0b7f4926a3984316b7fb21a4cc68bd48449746.
const YANG_COMPONENT_PATH = "M 737 91 Q 721 70 705 73 Q 678 80 640 89 Q 624 93 623 90 Q 623 86 640 70 Q 674 36 692 -4 Q 702 -20 712 -24 Q 719 -27 739 -11 Q 796 35 833 111 Q 872 192 912 415 Q 918 440 931 453 Q 944 463 931 480 Q 916 495 886 513 Q 864 526 791 507 Q 787 507 784 506 Q 670 481 600 472 Q 587 463 581 477 Q 578 495 657 621 Q 697 682 717 691 Q 730 698 729 704 Q 729 713 723 717 Q 701 736 672 746 Q 653 755 623 740 Q 518 704 454 703 Q 439 704 437 698 Q 434 694 440 685 Q 447 675 462 666 Q 475 657 525 670 Q 642 706 644 691 Q 644 646 541 491 Q 505 452 518 422 L 519 420 Q 522 413 547 420 L 578 431 Q 615 443 679 455 L 719 463 Q 789 476 824 477 Q 845 477 847 466 Q 865 373 799 198 Q 765 123 737 91 Z M 547 420 Q 548 419 549 417 Q 561 387 501 291 Q 476 252 442 213 Q 436 209 436 203 Q 436 199 441 199 Q 496 209 587 344 Q 587 353 608 378 Q 614 387 607 399 Q 595 420 578 431 C 554 449 535 448 547 420 Z M 679 455 Q 679 454 680 452 Q 698 374 596 217 Q 467 64 464 59 Q 457 53 467 52 Q 512 61 614 173 Q 686 276 746 396 Q 753 411 759 417 Q 765 423 762 432 Q 761 441 747 451 Q 734 461 719 463 C 690 471 675 475 679 455 Z"

// Source coordinates point upward. Reflect only at display time, with 20 units of padding.
const YANG_COMPONENT: CharacterLabGlyph = Object.freeze({
  path: YANG_COMPONENT_PATH,
  viewBox: '414 -775 550 822',
  transform: 'scale(1 -1)',
})

/** Unsupported platform fonts need only this small local vector; ordinary characters stay text. */
export const getCharacterLabGlyph = (character: string): CharacterLabGlyph | undefined =>
  character === '𠃓' ? YANG_COMPONENT : undefined
