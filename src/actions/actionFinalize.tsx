import { KEYS } from "../keys";
import { isInvisiblySmallElement } from "../element";
import { resetCursor } from "../utils";
import { ToolButton } from "../components/ToolButton";
import { done } from "../components/icons";
import { t } from "../i18n";
import { register } from "./register";
import { mutateElement } from "../element/mutateElement";
import { isPathALoop } from "../math";
import { LinearElementEditor } from "../element/linearElementEditor";
import Scene from "../scene/Scene";
import {
  maybeBindLinearElement,
  bindOrUnbindLinearElement,
} from "../element/binding";
import { isBindingElement } from "../element/typeChecks";

export const actionFinalize = register({
  name: "finalize",
  perform: (elements, appState, _, { canvas, focusContainer }) => {
    if (appState.editingLinearElement) {
      const {
        elementId,
        startBindingElement,
        endBindingElement,
      } = appState.editingLinearElement;
      const element = LinearElementEditor.getElement(elementId);

      if (element) {
        if (isBindingElement(element)) {
          bindOrUnbindLinearElement(
            element,
            startBindingElement,
            endBindingElement,
          );
        }
        return {
          elements:
            element.points.length < 2 || isInvisiblySmallElement(element)
              ? elements.filter((el) => el.id !== element.id)
              : undefined,
          appState: {
            ...appState,
            editingLinearElement: null,
          },
          commitToHistory: true,
        };
      }
    }

    let newElements = elements;

    if (appState.pendingImageElement) {
      mutateElement(appState.pendingImageElement, { isDeleted: true }, false);
    }

    if (window.document.activeElement instanceof HTMLElement) {
      focusContainer();
    }

    const multiPointElement = appState.multiElement
      ? appState.multiElement
      : appState.editingElement?.type === "freedraw"
      ? appState.editingElement
      : null;

    if (multiPointElement) {
      // pen and mouse have hover
      if (
        multiPointElement.type !== "freedraw" &&
        appState.lastPointerDownWith !== "touch"
      ) {
        const { points, lastCommittedPoint } = multiPointElement;
        if (
          !lastCommittedPoint ||
          points[points.length - 1] !== lastCommittedPoint
        ) {
          mutateElement(multiPointElement, {
            points: multiPointElement.points.slice(0, -1),
          });
        }
      }
      if (isInvisiblySmallElement(multiPointElement)) {
        newElements = newElements.slice(0, -1);
      }

      // If the multi point line closes the loop,
      // set the last point to first point.
      // This ensures that loop remains closed at different scales.
      const isLoop = isPathALoop(multiPointElement.points, appState.zoom.value);
      if (
        multiPointElement.type === "line" ||
        multiPointElement.type === "freedraw"
      ) {
        if (isLoop) {
          const linePoints = multiPointElement.points;
          const firstPoint = linePoints[0];
          mutateElement(multiPointElement, {
            points: linePoints.map((point, index) =>
              index === linePoints.length - 1
                ? ([firstPoint[0], firstPoint[1]] as const)
                : point,
            ),
          });
        }
      }

      if (
        isBindingElement(multiPointElement) &&
        !isLoop &&
        multiPointElement.points.length > 1
      ) {
        const [x, y] = LinearElementEditor.getPointAtIndexGlobalCoordinates(
          multiPointElement,
          -1,
        );
        maybeBindLinearElement(
          multiPointElement,
          appState,
          Scene.getScene(multiPointElement)!,
          { x, y },
        );
      }

      if (!appState.elementLocked && appState.elementType !== "freedraw") {
        appState.selectedElementIds[multiPointElement.id] = true;
      }
    }

    if (
      (!appState.elementLocked && appState.elementType !== "freedraw") ||
      !multiPointElement
    ) {
      resetCursor(canvas);
    }

    return {
      elements: newElements,
      appState: {
        ...appState,
        elementType:
          (appState.elementLocked || appState.elementType === "freedraw") &&
          multiPointElement
            ? appState.elementType
            : "selection",
        draggingElement: null,
        multiElement: null,
        editingElement: null,
        startBoundElement: null,
        suggestedBindings: [],
        selectedElementIds:
          multiPointElement &&
          !appState.elementLocked &&
          appState.elementType !== "freedraw"
            ? {
                ...appState.selectedElementIds,
                [multiPointElement.id]: true,
              }
            : appState.selectedElementIds,
        pendingImageElement: null,
      },
      commitToHistory: appState.elementType === "freedraw",
    };
  },
  keyTest: (event, appState) =>
    (event.key === KEYS.ESCAPE &&
      (appState.editingLinearElement !== null ||
        (!appState.draggingElement && appState.multiElement === null))) ||
    ((event.key === KEYS.ESCAPE || event.key === KEYS.ENTER) &&
      appState.multiElement !== null),
  PanelComponent: ({ appState, updateData }) => (
    <ToolButton
      type="button"
      icon={done}
      title={t("buttons.done")}
      aria-label={t("buttons.done")}
      onClick={updateData}
      visible={appState.multiElement != null}
    />
  ),
});
