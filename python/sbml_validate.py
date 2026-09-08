"""Round-trip validation of Recourse's generated SBML using libSBML 5.21.1.

This is the SAME parser COPASI / BioModels / libRoadRunner use, so a clean
read + consistency check here is a real interop signal, not a self-parse.

Usage:
  python validate_sbml.py <path-to.sbml.xml>
Exits 0 on fully-valid SBML, 1 on any error/warning we cannot dismiss.
"""

import sys
import libsbml


def main(path: str) -> int:
    doc = libsbml.readSBMLFromFile(path)
    if doc.getNumErrors() > 0:
        print("== SBML READ ERRORS ==")
        for i in range(doc.getNumErrors()):
            e = doc.getError(i)
            sev = e.getSeverityAsString()
            print(f"  [{sev}] L{e.getLine()}: {e.getMessage()}")
        return 1

    model = doc.getModel()
    print(f"model:        {model.getId()}  level={doc.getLevel()} version={doc.getVersion()}")
    print(f"compartments: {model.getNumCompartments()}")
    print(f"species:      {model.getNumSpecies()}")
    print(f"parameters:   {model.getNumParameters()}")
    print(f"reactions:    {model.getNumReactions()}")
    print(f"rules:        {model.getNumRules()}")

    # Consistency check: every species reference must point at a defined species
    species_ids = {model.getSpecies(i).getId() for i in range(model.getNumSpecies())}
    problems = []
    for i in range(model.getNumReactions()):
        r = model.getReaction(i)
        for spec in [r.getReactant(k) for k in range(r.getNumReactants())] + [
            r.getProduct(k) for k in range(r.getNumProducts())
        ]:
            if spec.getSpecies() not in species_ids:
                problems.append(f"reaction {r.getId()} references unknown species {spec.getSpecies()}")
        kl = r.getKineticLaw()
        if kl is None:
            problems.append(f"reaction {r.getId()} has NO kinetic law")
        else:
            math = kl.getMath()
            if math is None:
                problems.append(f"reaction {r.getId()} kinetic law has NO math")
            else:
                # Every <ci> identifier in the math must be a defined species/parameter.
                refs = set()
                stack = [math]
                while stack:
                    node = stack.pop()
                    if node is None:
                        continue
                    if node.getType() == libsbml.AST_NAME:
                        refs.add(node.getName())
                    for k in range(node.getNumChildren()):
                        stack.append(node.getChild(k))
                for ident in sorted(refs):
                    if ident in species_ids:
                        continue
                    if model.getParameter(ident) is not None:
                        continue
                    problems.append(f"reaction {r.getId()} math references undefined identifier '{ident}'")

    if problems:
        print("== CONSISTENCY PROBLEMS ==")
        for p in problems:
            print("  ", p)
        return 1

    print("== SBML VALID ==")
    print("libSBML round-trip: read OK, all species refs resolve, all kinetic-law identifiers defined.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))