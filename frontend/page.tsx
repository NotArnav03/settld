import { Hero195 } from "@/components/ui/hero-195"
import { TracingBeam } from "@/components/ui/tracing-beam"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import SwapCard from "@/components/ui/crypto-swap-card"

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Hero195 />

      <TracingBeam className="px-6">
        <div className="mx-auto max-w-2xl py-12">
          <Tabs defaultValue="swap" className="w-full">
            <TabsList className="mx-auto mb-6 flex w-fit">
              <TabsTrigger value="swap">Swap</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="flex justify-center">
              <SwapCard />
            </TabsContent>

            <TabsContent value="about">
              <p className="text-center text-sm text-muted-foreground">
                Live token pricing via CoinGecko, wrapped in the same design system as the hero above.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </TracingBeam>
    </main>
  )
}
