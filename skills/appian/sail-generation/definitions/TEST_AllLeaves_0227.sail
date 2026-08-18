=a!headerContentLayout(
  header: a!cardLayout(
    style: "NONE",
    padding: "STANDARD",
    contents: {
      a!columnsLayout(
        columns: {
          a!columnLayout(
            contents: {
              a!richTextDisplayField(
                value: "# Component Showcase" & char(10) & "Every leaf type demonstrated"
              )
            }
          )
        }
      )
    }
  ),
  contents: a!localVariables(
    local!activeTab: 1,
    a!tabLayout(
      tabs: {
        a!tabItem(
          label: "Data",
          contents: {
            a!columnsLayout(
              columns: {
                a!columnLayout(
                  width: "MEDIUM",
                  contents: {
                    a!sectionLayout(
                      label: "Data Grid",
                      contents: {
                        a!gridField(
                          label: "Sample Data Grid",
                          data: {
                            a!map(col1: "Cell 1-1", col2: "Cell 1-2", col3: "Cell 1-3"),
                            a!map(col1: "Cell 2-1", col2: "Cell 2-2", col3: "Cell 2-3"),
                            a!map(col1: "Cell 3-1", col2: "Cell 3-2", col3: "Cell 3-3")
                          },
                          columns: {
                            a!gridColumn(label: "Column 1", value: fv!row.col1),
                            a!gridColumn(label: "Column 2", value: fv!row.col2),
                            a!gridColumn(label: "Column 3", value: fv!row.col3)
                          }
                        )
                      }
                    )
                  }
                ),
                a!columnLayout(
                  width: "MEDIUM",
                  contents: {
                    a!sectionLayout(
                      label: "Column Chart",
                      contents: {
                        a!chartField(
                          label: "Sample Column Chart",
                          chartType: "COLUMN",
                          data: {
                            a!map(category: "Category A", value: 45),
                            a!map(category: "Category B", value: 72),
                            a!map(category: "Category C", value: 38),
                            a!map(category: "Category D", value: 61)
                          },
                          categories: a!chartData(data: local!data, categoryColumn: "category"),
                          series: {
                            a!chartSeries(label: "Value", data: local!data, valueColumn: "value")
                          }
                        )
                      }
                    )
                  }
                )
              }
            )
          }
        ),
        a!tabItem(
          label: "Metrics",
          contents: {
            a!sectionLayout(
              label: "KPIs",
              contents: {
                a!columnsLayout(
                  columns: {
                    a!columnLayout(
                      width: "NARROW",
                      contents: {
                        a!sideBySideLayout(
                          items: {
                            a!sideBySideItem(
                              item: a!stampField(
                                label: "Revenue",
                                value: "$2.5M",
                                backgroundColor: "ACCENT"
                              ),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!stampField(
                                label: "Users",
                                value: "1,250",
                                backgroundColor: "SUCCESS"
                              ),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!stampField(
                                label: "Tasks",
                                value: "87%",
                                backgroundColor: "INFO"
                              ),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!stampField(
                                label: "Status",
                                value: "Active",
                                backgroundColor: "POSITIVE"
                              ),
                              width: "AUTO"
                            )
                          },
                          alignVertical: "MIDDLE"
                        )
                      }
                    )
                  }
                )
              }
            ),
            a!sectionLayout(
              label: "Key-Value List",
              contents: {
                a!sideBySideLayout(
                  items: {
                    a!sideBySideItem(
                      item: a!sideBySideLayout(
                        items: {
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "**Key 1:**"),
                            width: "20%"
                          ),
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "Value 1"),
                            width: "80%"
                          )
                        }
                      ),
                      width: "AUTO"
                    ),
                    a!sideBySideItem(
                      item: a!sideBySideLayout(
                        items: {
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "**Key 2:**"),
                            width: "20%"
                          ),
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "Value 2"),
                            width: "80%"
                          )
                        }
                      ),
                      width: "AUTO"
                    ),
                    a!sideBySideItem(
                      item: a!sideBySideLayout(
                        items: {
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "**Key 3:**"),
                            width: "20%"
                          ),
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "Value 3"),
                            width: "80%"
                          )
                        }
                      ),
                      width: "AUTO"
                    ),
                    a!sideBySideItem(
                      item: a!sideBySideLayout(
                        items: {
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "**Key 4:**"),
                            width: "20%"
                          ),
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "Value 4"),
                            width: "80%"
                          )
                        }
                      ),
                      width: "AUTO"
                    ),
                    a!sideBySideItem(
                      item: a!sideBySideLayout(
                        items: {
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "**Key 5:**"),
                            width: "20%"
                          ),
                          a!sideBySideItem(
                            item: a!richTextDisplayField(value: "Value 5"),
                            width: "80%"
                          )
                        }
                      ),
                      width: "AUTO"
                    )
                  },
                  alignVertical: "TOP"
                )
              }
            )
          }
        ),
        a!tabItem(
          label: "Content",
          contents: {
            a!richTextDisplayField(
              value: "# Section Title"
            ),
            a!richTextDisplayField(
              value: "This is a rich text block demonstrating paragraph content. It can contain **bold**, *italic*, and other formatting. This showcases the richTextBlock leaf component with formatted text display."
            ),
            a!sectionLayout(
              label: "Tags",
              contents: {
                a!columnsLayout(
                  columns: {
                    a!columnLayout(
                      contents: {
                        a!sideBySideLayout(
                          items: {
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 1", backgroundColor: "ACCENT"),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 2", backgroundColor: "SUCCESS"),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 3", backgroundColor: "INFO"),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 4", backgroundColor: "WARN"),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 5", backgroundColor: "SECONDARY"),
                              width: "AUTO"
                            ),
                            a!sideBySideItem(
                              item: a!tag(text: "Tag 6", backgroundColor: "STANDARD"),
                              width: "AUTO"
                            )
                          }
                        )
                      }
                    )
                  }
                )
              }
            ),
            a!sectionLayout(
              label: "Item List",
              contents: {
                a!columnsLayout(
                  columns: {
                    a!columnLayout(
                      contents: {
                        a!forEach(
                          items: {1, 2, 3, 4},
                          expression: a!sideBySideLayout(
                            items: {
                              a!sideBySideItem(
                                item: a!userImageField(userIdentifier: null),
                                width: "20%"
                              ),
                              a!sideBySideItem(
                                item: a!richTextDisplayField(
                                  value: "Item " & fv!index
                                ),
                                width: "60%"
                              ),
                              a!sideBySideItem(
                                item: a!richTextDisplayField(
                                  value: "Trailing Text " & fv!index
                                ),
                                width: "20%"
                              )
                            }
                          )
                        )
                      }
                    )
                  }
                )
              }
            )
          }
        ),
        a!tabItem(
          label: "Visual",
          contents: {
            a!sectionLayout(
              label: "Banner",
              contents: {
                a!messageBanner(
                  message: "This is an informational banner with a heading and supporting text.",
                  type: "INFO",
                  marginBelow: "STANDARD"
                )
              }
            ),
            a!sectionLayout(
              label: "Side by Side Layout",
              contents: {
                a!sideBySideLayout(
                  items: {
                    a!sideBySideItem(
                      item: a!stampField(
                        label: "Status",
                        value: "Stamp",
                        backgroundColor: "ACCENT",
                        size: "MINIMIZE"
                      ),
                      width: "AUTO"
                    ),
                    a!sideBySideItem(
                      item: a!richTextDisplayField(
                        value: "## Heading with Stamp"
                      ),
                      width: "WIDE"
                    )
                  },
                  alignVertical: "MIDDLE"
                )
              }
            ),
            a!sectionLayout(
              label: "Image Cards",
              contents: {
                a!cardGroupLayout(
                  cards: {
                    a!cardLayout(
                      contents: {
                        a!imageField(
                          images: {
                            a!webImage(
                              uri: "https://picsum.photos/300/200?random=1",
                              altText: "Sample image 1"
                            )
                          },
                          height: "MEDIUM"
                        ),
                        a!richTextDisplayField(
                          value: "Image Card 1"
                        )
                      }
                    ),
                    a!cardLayout(
                      contents: {
                        a!imageField(
                          images: {
                            a!webImage(
                              uri: "https://picsum.photos/300/200?random=2",
                              altText: "Sample image 2"
                            )
                          },
                          height: "MEDIUM"
                        ),
                        a!richTextDisplayField(
                          value: "Image Card 2"
                        )
                      }
                    ),
                    a!cardLayout(
                      contents: {
                        a!imageField(
                          images: {
                            a!webImage(
                              uri: "https://picsum.photos/300/200?random=3",
                              altText: "Sample image 3"
                            )
                          },
                          height: "MEDIUM"
                        ),
                        a!richTextDisplayField(
                          value: "Image Card 3"
                        )
                      }
                    )
                  },
                  columns: 3
                )
              }
            )
          }
        )
      },
      value: local!activeTab,
      saveInto: local!activeTab
    )
  )
)
