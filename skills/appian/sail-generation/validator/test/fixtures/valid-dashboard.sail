a!localVariables(
  local!count: 42,
  local!label: "Open Tickets",
  a!headerContentLayout(
    header: {
      a!cardLayout(
        contents: {
          a!richTextDisplayField(
            labelPosition: "COLLAPSED",
            value: {
              a!richTextItem(text: local!label, style: "PLAIN"),
              char(10),
              a!richTextItem(text: tostring(local!count), size: "LARGE", style: "STRONG")
            }
          )
        },
        style: "NONE",
        padding: "STANDARD",
        shape: "ROUNDED",
        showBorder: true()
      )
    },
    contents: {
      a!sectionLayout(
        label: "Dashboard Content",
        contents: {
          a!richTextDisplayField(
            labelPosition: "COLLAPSED",
            value: {
              a!richTextItem(text: "Hello world", style: "PLAIN")
            }
          )
        }
      )
    }
  )
)
