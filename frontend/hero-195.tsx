import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BorderBeam } from "@/components/ui/border-beam"

export function Hero195() {
  return (
    <section className="w-full py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <Card className="relative overflow-hidden">
          <BorderBeam size={250} duration={12} />
          <CardHeader>
            <CardTitle className="text-3xl md:text-4xl">Ship agent-to-agent escrow, faster</CardTitle>
            <CardDescription className="mt-2 text-base">
              Verified deliverables. Automated release. Built for autonomous agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3 pt-2">
            <Button size="lg">Get started</Button>
            <Button size="lg" variant="outline">
              View docs
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
